import type { DiagnosisResult } from '../types/repair'
import { isValidDiagnosisResult } from '../services/repairSession'
import { decideFromDiagnosis, isBlocked } from './riskDecision'

/*
 * Outcome statuses shown in History and on a loaded session.
 *
 * Only `in_progress`, `completed` and `blocked` can come from real data today:
 * the database allows only 'in_progress' | 'completed', and `blocked` is worked
 * out from the stored diagnosis with the V04 risk rule. The other statuses are
 * mapped so the UI is ready for them, and are reached only by dev fixtures.
 */
export const SESSION_STATUSES = [
  'draft',
  'analyzing',
  'needs_followup',
  'blocked',
  'guide_ready',
  'in_progress',
  'awaiting_observation',
  'unresolved',
  'monitoring',
  'completed',
] as const

export type KnownSessionStatus = (typeof SESSION_STATUSES)[number]
export type SessionStatus = KnownSessionStatus | 'unknown'

export function normalizeStatus(value: unknown): SessionStatus {
  return typeof value === 'string' && (SESSION_STATUSES as readonly string[]).includes(value)
    ? (value as KnownSessionStatus)
    : 'unknown'
}

/** A blocked diagnosis always wins over the stored status, so it can never look ready. */
export function deriveSessionStatus(status: unknown, diagnosis: DiagnosisResult | null): SessionStatus {
  if (diagnosis && isBlocked(decideFromDiagnosis(diagnosis, null))) return 'blocked'
  return normalizeStatus(status)
}

/** i18n key for the outcome label. Unknown values get the neutral "Saved" label. */
export function statusLabelKey(status: SessionStatus): string {
  return `history.outcome.${status}`
}

export interface SessionLinkTarget {
  path: '/diagnosis' | '/guide'
  labelKey: 'history.view' | 'history.continue'
}

/**
 * Where a History card leads.
 * - Only guide_ready and in_progress can lead to the guide, and only while the
 *   guide is available and the session has stored details.
 * - blocked, needs_followup, finished and unknown statuses always open the result.
 */
export function historyLinkFor(
  status: SessionStatus,
  hasDetails: boolean,
  guideAvailable: boolean
): SessionLinkTarget {
  if (hasDetails && guideAvailable && (status === 'guide_ready' || status === 'in_progress')) {
    return { path: '/guide', labelKey: 'history.continue' }
  }
  return { path: '/diagnosis', labelKey: 'history.view' }
}

/**
 * Keeps a saved step inside the valid range. `clamped` is true when the saved
 * value had to change (out of range, not a whole number, or not a number).
 * Not wired into the guide yet: step restore is deferred until approved steps exist.
 */
export function clampStep(step: unknown, total: number): { step: number; clamped: boolean } {
  const count = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
  if (count === 0) return { step: 0, clamped: step !== 0 }
  if (typeof step !== 'number' || !Number.isFinite(step)) return { step: 0, clamped: true }
  const whole = Math.floor(step)
  const next = Math.min(Math.max(whole, 0), count - 1)
  return { step: next, clamped: next !== step }
}

/** Minimal row shape used for History cards (real rows and fixtures). */
export interface HistoryRowLike {
  id: string
  title: string | null
  issue_name: string | null
  diagnosis: DiagnosisResult | null
  status: string | null
  updated_at: string | null
  message_count: number | null
}

export interface HistoryCard {
  id: string
  /** Stored title only. Null for rows without details: the UI shows a generic label. */
  title: string | null
  updatedAt: string | null
  status: SessionStatus
  hasDetails: boolean
  messageCount: number
  /** Stored verification summary from a real check photo, if any. */
  comparison: string | null
}

export function toHistoryCard(row: HistoryRowLike): HistoryCard {
  const hasDetails = isValidDiagnosisResult(row.diagnosis)
  const diagnosis = hasDetails ? row.diagnosis : null
  const summary = diagnosis?.verification?.summary
  return {
    id: row.id,
    title: hasDetails ? row.title ?? row.issue_name ?? diagnosis?.issueName ?? null : null,
    updatedAt: row.updated_at,
    status: deriveSessionStatus(row.status, diagnosis),
    hasDetails,
    messageCount: typeof row.message_count === 'number' && row.message_count > 0 ? row.message_count : 0,
    comparison: typeof summary === 'string' && summary.trim() ? summary.trim() : null,
  }
}
