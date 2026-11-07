// Server response ko validate karta hai. Koi default/mock value nahi bharta.
import type {
  DiagnosisResult,
  RepairVerification,
  VerificationStatus,
} from '../types/repair'
import { AnalysisError, isAnalysisErrorCode } from '../types/analysis'

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
    safetyStop: data.safetyStop === true || severity === 'high',
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
