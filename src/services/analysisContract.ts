// Server response ko validate karta hai. Koi default/mock value nahi bharta.
import type {
  DiagnosisResult,
  ObservationResult,
  ObservationStatus,
  RepairVerification,
  VerificationStatus,
} from '../types/repair'
import { AnalysisError, isAnalysisErrorCode } from '../types/analysis'
import { OBSERVATION_POLICY_VERSION } from '../utils/observationPolicy'
import { parseGuideSteps } from '../utils/guideSteps'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

// { ok:false, error:{ code, retryable, retryAfterSeconds? } } -> AnalysisError
export function errorFromEnvelope(body: unknown): AnalysisError | null {
  const root = asRecord(body)
  const error = asRecord(root?.error)
  if (
    !root ||
    root.ok !== false ||
    !error ||
    !isAnalysisErrorCode(error.code) ||
    typeof error.retryable !== 'boolean'
  ) return null
  const retry = error.retryAfterSeconds
  if (
    retry !== undefined &&
    (typeof retry !== 'number' || !Number.isInteger(retry) || retry < 1 || retry > 3600)
  ) {
    return null
  }
  return new AnalysisError(
    error.code,
    error.retryable,
    typeof retry === 'number' ? retry : undefined
  )
}

// { ok:true, data } -> DiagnosisResult. Galat shape par invalid_response throw.
export function diagnosisFromEnvelope(body: unknown): DiagnosisResult {
  const known = errorFromEnvelope(body)
  if (known) throw known // 200 + ok:false bhi defensively handle

  const root = asRecord(body)
  const data = asRecord(root?.data)
  if (!root || root.ok !== true || !data) throw new AnalysisError('invalid_response', true)

  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  const issueName = str(data.issueName)
  const summary = str(data.summary)
  const recommendedFix = str(data.recommendedFix)
  const nextStepAdvice = str(data.nextStepAdvice)
  const safetyWarning = str(data.safetyWarning)
  const explanation = str(data.explanation)
  const severity = data.severity

  if (
    !issueName || !summary || !recommendedFix ||
    nextStepAdvice === null || safetyWarning === null || explanation === null ||
    (severity !== 'low' && severity !== 'medium' && severity !== 'high') ||
    typeof data.confidence !== 'number' ||
    !Number.isFinite(data.confidence) ||
    data.confidence < 0 ||
    data.confidence > 100 ||
    !Array.isArray(data.recommendedTools) ||
    !data.recommendedTools.every((t) => typeof t === 'string') ||
    (data.safetyStop !== undefined && typeof data.safetyStop !== 'boolean')
  ) {
    throw new AnalysisError('invalid_response', true)
  }

  const safetyStop = data.safetyStop === true || severity === 'high'
  // A blocked result never carries steps; a malformed guide is dropped, not fatal.
  const guideSteps = safetyStop ? [] : parseGuideSteps(data.guideSteps)

  return {
    issueName,
    confidence: Math.round(data.confidence),
    summary,
    severity,
    recommendedFix,
    recommendedTools: data.recommendedTools as string[],
    nextStepAdvice,
    safetyWarning,
    explanation,
    safetyStop,
    ...(guideSteps.length ? { guideSteps } : {}),
  }
}

export function verificationFromEnvelope(body: unknown): RepairVerification {
  const known = errorFromEnvelope(body)
  if (known) throw known

  const root = asRecord(body)
  const data = asRecord(root?.data)
  const statuses: VerificationStatus[] = ['resolved', 'monitor', 'unresolved', 'professional']
  if (
    !root ||
    root.ok !== true ||
    !data ||
    typeof data.status !== 'string' ||
    !statuses.includes(data.status as VerificationStatus) ||
    typeof data.summary !== 'string' ||
    !data.summary.trim() ||
    typeof data.nextAdvice !== 'string' ||
    !data.nextAdvice.trim() ||
    !Array.isArray(data.checks) ||
    data.checks.length === 0
  ) {
    throw new AnalysisError('invalid_response', true)
  }

  const checks = data.checks.map((value) => {
    const check = asRecord(value)
    if (
      !check ||
      typeof check.label !== 'string' ||
      !check.label.trim() ||
      typeof check.passed !== 'boolean'
    ) {
      throw new AnalysisError('invalid_response', true)
    }
    return { label: check.label, passed: check.passed }
  })
  if (data.status === 'resolved' && checks.some((check) => !check.passed)) {
    throw new AnalysisError('invalid_response', true)
  }

  return {
    status: data.status as VerificationStatus,
    summary: data.summary,
    checks,
    nextAdvice: data.nextAdvice,
  }
}

// S08: strict validation of the truthful observation payload.
// { ok:true, data } -> ObservationResult. Any shape mismatch throws
// invalid_response. Crucially, it refuses to let a result over-claim:
//  - professional_review MUST carry at least one warning (why a pro is needed),
//  - a positive visible_change MUST NOT also carry warnings (those imply an
//    unresolved concern, so the server is contradicting itself) — reject it as
//    invalid rather than silently show a misleading "improved" result.
// It never fills defaults and never fabricates a status.
export function observationFromEnvelope(body: unknown): ObservationResult {
  const known = errorFromEnvelope(body)
  if (known) throw known

  const root = asRecord(body)
  const data = asRecord(root?.data)
  if (!root || root.ok !== true || !data) {
    throw new AnalysisError('invalid_response', true)
  }

  const statuses: ObservationStatus[] = [
    'visible_change',
    'no_clear_change',
    'incomparable',
    'insufficient_evidence',
    'professional_review',
  ]
  const status = data.status
  if (typeof status !== 'string' || !statuses.includes(status as ObservationStatus)) {
    throw new AnalysisError('invalid_response', true)
  }
  if (typeof data.summary !== 'string' || !data.summary.trim()) {
    throw new AnalysisError('invalid_response', true)
  }
  if (typeof data.nextAdvice !== 'string' || !data.nextAdvice.trim()) {
    throw new AnalysisError('invalid_response', true)
  }

  const toStringList = (value: unknown): string[] => {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
      throw new AnalysisError('invalid_response', true)
    }
    return value.map((v) => v.trim()).filter(Boolean)
  }
  const limitations = toStringList(data.limitations)
  const warnings = toStringList(data.warnings)

  const typedStatus = status as ObservationStatus

  // professional_review without a reason is not trustworthy.
  if (typedStatus === 'professional_review' && warnings.length === 0) {
    throw new AnalysisError('invalid_response', true)
  }
  // A "visible improvement" that also carries warnings is self-contradictory:
  // the server must escalate instead of claiming improvement. Reject it rather
  // than render a misleading positive.
  if (typedStatus === 'visible_change' && warnings.length > 0) {
    throw new AnalysisError('invalid_response', true)
  }

  return {
    status: typedStatus,
    summary: data.summary.trim(),
    limitations,
    warnings,
    nextAdvice: data.nextAdvice.trim(),
    safetyOverride: false,
    policyVersion:
      typeof data.policyVersion === 'string' && data.policyVersion.trim()
        ? data.policyVersion.trim()
        : OBSERVATION_POLICY_VERSION,
  }
}
