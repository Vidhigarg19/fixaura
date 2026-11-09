// DEV-ONLY test data for V06 resume and history. Only reachable through dynamic
// imports behind `import.meta.env.DEV` (useSessionLoader, History), so it is not part of
// a production build. Nothing here calls the real service or saves anything.
// Strings are test data and are intentionally not translated.
import type { DiagnosisResult } from '../types/repair'
import type { LoadOutcome, ResumeView } from '../services/sessionResume'
import { deriveSessionStatus, type HistoryRowLike } from '../utils/sessionStatus'

export const SESSION_FIXTURE_NAMES = [
  'session_loading',
  'session_not_found',
  'session_offline',
  'session_error',
  'session_in_progress',
  'session_blocked',
  'session_completed',
  'session_missing_photo',
] as const

export const HISTORY_FIXTURE_NAMES = ['history_mixed', 'history_legacy_row'] as const

// Valid v4-shaped ids so the same id checks as real data apply.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const TAP: DiagnosisResult = {
  issueName: 'Dripping kitchen tap (test data)',
  confidence: 78,
  summary: 'Water drips from the spout after the tap is closed. (test data)',
  severity: 'low',
  recommendedFix: 'Test fix: replace the washer. (test data)',
  recommendedTools: [],
  nextStepAdvice: 'Test advice. (test data)',
  safetyWarning: 'Turn off the water supply first. (test data)',
  explanation: 'Test explanation. (test data)',
  safetyStop: false,
}

const SOCKET: DiagnosisResult = {
  issueName: 'Scorched wall socket (test data)',
  confidence: 86,
  summary: 'Scorch marks around a wall socket. (test data)',
  severity: 'high',
  recommendedFix: 'Test fix: contact an electrician. (test data)',
  recommendedTools: [],
  nextStepAdvice: 'Do not use the socket. (test data)',
  safetyWarning: 'Possible electrical fault. (test data)',
  explanation: 'Test explanation. (test data)',
  safetyStop: true,
}

const COMPLETED: DiagnosisResult = {
  ...TAP,
  issueName: 'Loose cabinet hinge (test data)',
  verification: {
    status: 'monitor',
    summary: 'The check photo shows the door sitting level. (test data)',
    checks: [{ label: 'Door sits level (test data)', passed: true }],
    nextAdvice: 'Check again in a week. (test data)',
  },
}

function view(n: number, diagnosis: DiagnosisResult | null, status: string, extra: Partial<ResumeView> = {}): ResumeView {
  return {
    id: id(n),
    status: deriveSessionStatus(status, diagnosis),
    issueName: diagnosis?.issueName ?? null,
    description: diagnosis ? 'The tap keeps dripping at night. (test data)' : '',
    diagnosis,
    currentStep: 0,
    updatedAt: '2026-11-07T10:00:00.000Z',
    hasStoredPhoto: true,
    ...extra,
  }
}

const SESSION_VIEWS: Record<string, ResumeView> = {
  session_in_progress: view(1, TAP, 'in_progress'),
  session_blocked: view(2, SOCKET, 'in_progress'),
  session_completed: view(3, COMPLETED, 'completed'),
  session_missing_photo: view(4, TAP, 'in_progress', { hasStoredPhoto: false }),
}

function row(n: number, status: string | null, diagnosis: DiagnosisResult | null, title?: string): HistoryRowLike {
  return {
    id: id(100 + n),
    title: title ?? diagnosis?.issueName ?? null,
    issue_name: title ?? diagnosis?.issueName ?? null,
    diagnosis,
    status,
    updated_at: new Date(Date.UTC(2026, 10, 7, 12, 0) - n * 3_600_000).toISOString(),
    message_count: n % 3,
  }
}

const named = (d: DiagnosisResult, label: string): DiagnosisResult => ({ ...d, issueName: `${label} (test data)` })

const HISTORY_ROWS: Record<string, HistoryRowLike[]> = {
  history_mixed: [
    row(1, 'in_progress', named(TAP, 'In progress repair')),
    row(2, 'draft', named(TAP, 'Draft repair')),
    row(3, 'analyzing', named(TAP, 'Analyzing repair')),
    row(4, 'needs_followup', named(TAP, 'Needs more details repair')),
    row(5, 'blocked', named(SOCKET, 'Blocked repair')),
    row(6, 'in_progress', named(SOCKET, 'High-risk repair saved as in progress')),
    row(7, 'guide_ready', named(TAP, 'Ready to start repair')),
    row(8, 'awaiting_observation', named(TAP, 'Waiting for check photo repair')),
    row(9, 'unresolved', named(TAP, 'Still not fixed repair')),
    row(10, 'monitoring', named(TAP, 'Keep an eye on it repair')),
    row(11, 'completed', named(COMPLETED, 'Steps finished repair')),
    row(12, 'something_new', named(TAP, 'Unknown status repair')),
  ],
  history_legacy_row: [
    row(1, 'in_progress', null),
    row(2, 'in_progress', named(TAP, 'Repair with details')),
  ],
}

function rowToView(r: HistoryRowLike): ResumeView {
  return {
    id: r.id,
    status: deriveSessionStatus(r.status, r.diagnosis),
    issueName: r.diagnosis ? r.issue_name : null,
    description: r.diagnosis ? 'Test description for this saved repair. (test data)' : '',
    diagnosis: r.diagnosis,
    currentStep: 0,
    updatedAt: r.updated_at,
    hasStoredPhoto: false,
  }
}

export function isHistoryFixture(name: string): boolean {
  return (HISTORY_FIXTURE_NAMES as readonly string[]).includes(name)
}

/** History list for a fixture. Any non-history fixture gets the mixed list. */
export function historyFixtureRows(name: string): HistoryRowLike[] {
  return (HISTORY_ROWS[name] ?? HISTORY_ROWS.history_mixed).map((r) => ({ ...r }))
}

/** Resolves a session for the loader in fixture mode. Never calls the real service. */
export function resolveFixtureSession(name: string, sessionId: string | null): Promise<LoadOutcome> {
  if (name === 'session_loading') return new Promise<LoadOutcome>(() => {})
  const settle = (outcome: LoadOutcome) =>
    new Promise<LoadOutcome>((resolve) => setTimeout(() => resolve(outcome), 400))
  if (name === 'session_not_found') return settle({ kind: 'not_found' })
  if (name === 'session_offline') return settle({ kind: 'offline' })
  if (name === 'session_error') return settle({ kind: 'error' })
  const fixed = SESSION_VIEWS[name]
  if (fixed) return settle({ kind: 'ready', view: { ...fixed } })
  const rows = HISTORY_ROWS[name] ?? (name.startsWith('history_') ? [] : HISTORY_ROWS.history_mixed)
  const match = sessionId ? rows.find((r) => r.id === sessionId) : undefined
  return settle(match ? { kind: 'ready', view: rowToView(match) } : { kind: 'not_found' })
}

/** Local-only delete for fixture mode. */
export function fixtureDelete(): Promise<boolean> {
  return new Promise((resolve) => setTimeout(() => resolve(true), 500))
}
