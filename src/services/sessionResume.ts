// Loads ONE saved repair session for the signed-in user, for /diagnosis, /tools
// and /guide with ?session=<id>. Thin layer over historyService: RLS is the
// authorization, and the row owner is compared with the signed-in user as well.
//
// Never logs ids, descriptions or tokens.
import type { DiagnosisResult, RepairVerification, VerificationStatus } from '../types/repair'
import { getSession as fetchHistorySession, type HistorySession } from './historyService'
import {
  clearSession,
  getSession as getCachedSession,
  isValidDiagnosisResult,
  saveSession,
} from './repairSession'
import { createRequestGuard } from '../utils/requestGuard'
import { parseGuideSteps } from '../utils/guideSteps'
import { isNetworkError, isOffline } from '../utils/networkError'
import { deriveSessionStatus, type SessionStatus } from '../utils/sessionStatus'
import { mostSevere } from '../utils/riskDecision'
import { safetyRiskSignal, screenFields } from '../lib/safety'
import {
  MAX_CHECK_LABEL_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_DIAGNOSIS_TEXT_LENGTH,
  MAX_ISSUE_NAME_LENGTH,
  MAX_TOOL_LENGTH,
  MAX_TOOLS,
} from '../config/limits'

export { MAX_DESCRIPTION_LENGTH, MAX_ISSUE_NAME_LENGTH }

// Postgres gen_random_uuid() ids. Anything else is rejected before a request.
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID.test(value)
}

// ---- Photo data never goes into the stored diagnosis ----

const DATA_URI = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]*/gi
const LONG_BASE64 = /[A-Za-z0-9+/]{200,}={0,2}/g

function withoutPhotoData(value: string): string {
  return value.replace(DATA_URI, '').replace(LONG_BASE64, '')
}

const VERIFICATION_STATUSES: VerificationStatus[] = ['resolved', 'monitor', 'unresolved', 'professional']

function cleanVerification(value: unknown): RepairVerification | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Partial<RepairVerification>
  if (
    !VERIFICATION_STATUSES.includes(v.status as VerificationStatus) ||
    typeof v.summary !== 'string' ||
    !Array.isArray(v.checks)
  ) {
    return undefined
  }
  return {
    status: v.status as VerificationStatus,
    summary: capText(withoutPhotoData(v.summary), MAX_DIAGNOSIS_TEXT_LENGTH),
    checks: v.checks
      .filter((check) => check && typeof check.label === 'string' && typeof check.passed === 'boolean')
      .map((check) => ({
        label: capText(withoutPhotoData(check.label), MAX_CHECK_LABEL_LENGTH),
        passed: check.passed,
      })),
    nextAdvice:
      typeof v.nextAdvice === 'string' ? capText(withoutPhotoData(v.nextAdvice), MAX_DIAGNOSIS_TEXT_LENGTH) : '',
  }
}

/**
 * D13: shortens text longer than `max` code points to `max`, ending in a visible "…" so a
 * cut is never silent. Shorter text is returned unchanged.
 */
export function capText(value: string, max: number): string {
  const chars = Array.from(value)
  if (chars.length <= max) return value
  return `${chars.slice(0, max - 1).join('')}…`
}

/** The client hazard screen's view of a result (same fields as textRiskSignal). */
function screenedSignal(d: Pick<DiagnosisResult, 'issueName' | 'summary' | 'recommendedFix'>) {
  return safetyRiskSignal(screenFields([d.issueName, d.summary, d.recommendedFix]))
}

/**
 * D13: caps stored diagnosis text. Rules:
 * - safetyWarning is safety guidance and is never shortened (photo data is still removed);
 * - the fields the hazard screen reads (issue name, summary, fix) are only shortened when
 *   the shortened result screens AT LEAST as severe as the full one; otherwise they are
 *   kept in full, so a reload can never show a lower risk than the fresh result did.
 */
function capDiagnosisText(full: DiagnosisResult): DiagnosisResult {
  const capped: DiagnosisResult = {
    ...full,
    issueName: capText(full.issueName, MAX_ISSUE_NAME_LENGTH),
    summary: capText(full.summary, MAX_DIAGNOSIS_TEXT_LENGTH),
    recommendedFix: capText(full.recommendedFix, MAX_DIAGNOSIS_TEXT_LENGTH),
    recommendedTools: full.recommendedTools.slice(0, MAX_TOOLS).map((tool) => capText(tool, MAX_TOOL_LENGTH)),
    nextStepAdvice: capText(full.nextStepAdvice, MAX_DIAGNOSIS_TEXT_LENGTH),
    ...(typeof full.explanation === 'string'
      ? { explanation: capText(full.explanation, MAX_DIAGNOSIS_TEXT_LENGTH) }
      : {}),
  }
  const fullSignal = screenedSignal(full)
  if (mostSevere(screenedSignal(capped), fullSignal) !== screenedSignal(capped)) {
    // Shortening would hide a hazard the full text shows: keep the screened fields whole.
    return { ...capped, issueName: full.issueName, summary: full.summary, recommendedFix: full.recommendedFix }
  }
  return capped
}

/**
 * Copies ONLY the known DiagnosisResult fields. Any photo field (imageDataUrl,
 * base64, ...) is dropped, data URIs or long base64 runs inside text are removed, and
 * (D13) over-long text is capped by capDiagnosisText.
 */
export function stripPhotoData(diagnosis: DiagnosisResult): DiagnosisResult {
  return capDiagnosisText(stripPhotoFields(diagnosis))
}

function stripPhotoFields(diagnosis: DiagnosisResult): DiagnosisResult {
  const verification = cleanVerification(diagnosis.verification)
  // Guide steps are re-validated and cleaned of photo data like every other text field.
  const guideSteps = parseGuideSteps(diagnosis.guideSteps).map((step) => ({
    ...step,
    title: withoutPhotoData(step.title),
    instruction: withoutPhotoData(step.instruction),
    safetyNote: withoutPhotoData(step.safetyNote),
  }))
  return {
    issueName: withoutPhotoData(diagnosis.issueName),
    confidence: diagnosis.confidence,
    summary: withoutPhotoData(diagnosis.summary),
    severity: diagnosis.severity,
    recommendedFix: withoutPhotoData(diagnosis.recommendedFix),
    recommendedTools: diagnosis.recommendedTools
      .filter((tool): tool is string => typeof tool === 'string')
      .map(withoutPhotoData),
    nextStepAdvice: withoutPhotoData(diagnosis.nextStepAdvice ?? ''),
    safetyWarning: withoutPhotoData(diagnosis.safetyWarning ?? ''),
    ...(typeof diagnosis.explanation === 'string'
      ? { explanation: withoutPhotoData(diagnosis.explanation) }
      : {}),
    ...(typeof diagnosis.safetyStop === 'boolean' ? { safetyStop: diagnosis.safetyStop } : {}),
    ...(guideSteps.length ? { guideSteps } : {}),
    ...(verification ? { verification } : {}),
  }
}

function truncate(value: string, max: number): string {
  // Count code points so a cut never splits a surrogate pair.
  return Array.from(value).slice(0, max).join('')
}

/** Extra columns written by the Diagnosis page's existing repair_sessions insert. */
export function sessionDetailsForInsert(diagnosis: DiagnosisResult, description: string | undefined) {
  const clean = stripPhotoData(diagnosis)
  const name = truncate(clean.issueName.trim(), MAX_ISSUE_NAME_LENGTH)
  return {
    diagnosis: clean,
    description: truncate(description ?? '', MAX_DESCRIPTION_LENGTH),
    issue_name: name,
    title: name,
  }
}

// ---- Loading ----

export interface ResumeView {
  id: string
  status: SessionStatus
  /** Stored issue name, or null for older rows without details. */
  issueName: string | null
  description: string
  /** Null for older rows that were saved without a diagnosis. */
  diagnosis: DiagnosisResult | null
  currentStep: number
  updatedAt: string | null
  /** True when the row has a stored photo reference (repair_sessions.image_path). */
  hasStoredPhoto: boolean
  /** The private storage path of that photo; render it via resolveMediaUrl, never directly. */
  imagePath?: string | null
}

export type LoadOutcome =
  | { kind: 'ready'; view: ResumeView }
  | { kind: 'not_found' }
  | { kind: 'offline' }
  | { kind: 'error' }

export function toResumeView(row: HistorySession): ResumeView {
  const diagnosis = isValidDiagnosisResult(row.diagnosis) ? stripPhotoData(row.diagnosis) : null
  return {
    id: row.id,
    status: deriveSessionStatus(row.status, diagnosis),
    issueName: diagnosis ? row.issue_name ?? row.title ?? diagnosis.issueName : null,
    description: typeof row.description === 'string' ? row.description : '',
    diagnosis,
    currentStep: typeof row.current_step === 'number' && Number.isFinite(row.current_step) ? row.current_step : 0,
    updatedAt: row.updated_at,
    hasStoredPhoto: typeof row.image_path === 'string' && row.image_path.trim().length > 0,
    imagePath: typeof row.image_path === 'string' && row.image_path.trim() ? row.image_path.trim() : null,
  }
}

export type SessionFetcher = (id: string) => Promise<HistorySession | null>

/**
 * Missing, deleted and someone else's session all return the same `not_found`.
 * A bad id or an offline browser sends no request.
 */
export async function loadOwnSession(
  id: string,
  userId: string,
  fetcher: SessionFetcher = fetchHistorySession
): Promise<LoadOutcome> {
  if (!isValidSessionId(id)) return { kind: 'not_found' }
  if (isOffline()) return { kind: 'offline' }
  let row: HistorySession | null
  try {
    row = await fetcher(id)
  } catch (error) {
    return isNetworkError(error) ? { kind: 'offline' } : { kind: 'error' }
  }
  if (!row || row.id !== id || row.user_id !== userId) return { kind: 'not_found' }
  return { kind: 'ready', view: toResumeView(row) }
}

/**
 * Runs loads so that only the latest one can report back. A late response for an
 * older id (or after `cancel`) is ignored.
 */
export function createLatestOnlyLoader() {
  const guard = createRequestGuard()
  return {
    run(load: () => Promise<LoadOutcome>, onSettle: (outcome: LoadOutcome) => void) {
      const token = guard.next()
      load().then(
        (outcome) => {
          if (guard.isCurrent(token)) onSettle(outcome)
        },
        () => {
          if (guard.isCurrent(token)) onSettle({ kind: 'error' })
        }
      )
    },
    cancel() {
      guard.invalidate()
    },
  }
}

// ---- Cache ----

/**
 * After a VERIFIED load, mirror the session into the existing browser cache so
 * the current pages keep working. A cached session with another id or owner is
 * replaced, never merged. The cache is never read while ?session is present.
 */
export function writeVerifiedSessionToCache(view: ResumeView, userId: string) {
  const cached = getCachedSession()
  const cachedId = cached?.historySessionId ?? cached?.diagnosisPersistence?.repairSessionId
  if (cached && (cachedId !== view.id || cached.ownerUserId !== userId)) clearSession()
  if (!view.diagnosis) return
  saveSession({
    diagnosis: view.diagnosis,
    description: view.description,
    ownerUserId: userId,
    historySessionId: view.id,
    // Saved steps are not approved guidance (V05) and are never restored from here.
    steps: undefined,
    currentStep: view.currentStep,
  })
}

// ---- Links ----

/** Builds a link that keeps the session id and, in dev fixture mode, the fixture name. */
export function sessionHref(path: string, sessionId: string | null, fixtureName: string | null = null): string {
  const params = new URLSearchParams()
  if (sessionId) params.set('session', sessionId)
  if (fixtureName) params.set('fixture', fixtureName)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

/**
 * Opens a saved session in the live guide pages (/tools and /guide).
 *
 * Those pages read the browser cache, which useDiagnosisSource then reconciles with the
 * database row. The loaded row is written into the cache; a cache from ANOTHER repair is
 * cleared first, but the same repair's cache (and its photo) is kept. The photo itself is
 * found by useRepairPhoto: this tab's capture, the on-device copy, or the stored path.
 *
 * V05: generated steps are never seeded. The cache gets the durable session fields and
 * the photo reference only; steps come from an approved template behind the gate.
 *
 * Returns false when the row has no diagnosis.
 */
export function seedRepairCache(view: ResumeView, userId: string): boolean {
  if (!view.diagnosis) return false
  // Clear only a cache that belongs to ANOTHER repair or user. Clearing the same repair
  // threw away this tab's photo (imageDataUrl) and attempt id, which is what left the
  // guide's photo box empty after pressing Start / Continue on a saved result.
  const cached = getCachedSession()
  const cachedId = cached?.historySessionId ?? cached?.diagnosisPersistence?.repairSessionId
  if (cached && (cachedId !== view.id || cached.ownerUserId !== userId)) clearSession()
  saveSession({
    diagnosis: view.diagnosis,
    description: view.description,
    ownerUserId: userId,
    historySessionId: view.id,
    diagnosisPersistence: { userId, repairSessionId: view.id },
    // A resumed repair keeps its photo: the stored path is signed when it is displayed.
    ...(view.imagePath ? { imagePath: view.imagePath } : {}),
    steps: [],
    currentStep: 0,
  })
  return true
}
