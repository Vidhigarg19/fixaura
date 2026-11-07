import type { DiagnosisResult } from '../types/repair'

// Pure risk-decision logic. RULE: the frontend only ever takes the MOST SEVERE decision
// that the server data supports. It never computes a lower level, never downgrades a
// blocked session, and nothing a user does (checkbox, toggle, confidence value) feeds in.

export type RiskDecision = 'safe' | 'caution' | 'professional' | 'emergency'

const RANK: Record<RiskDecision, number> = {
  safe: 0,
  caution: 1,
  professional: 2,
  emergency: 3,
}

export function riskRank(decision: RiskDecision): number {
  return RANK[decision]
}

/** professional and emergency are "blocked": no tools, no repair steps. */
export function isBlocked(decision: RiskDecision): boolean {
  return RANK[decision] >= RANK.professional
}

export function mostSevere(first: RiskDecision, ...rest: RiskDecision[]): RiskDecision {
  let result = first
  for (const candidate of rest) {
    if (RANK[candidate] > RANK[result]) result = candidate
  }
  return result
}

export interface DecisionInput {
  /** Today's field: 'low' | 'medium' | 'high'. */
  severity?: unknown
  /** Agreed contract field: 'low' | 'medium' | 'high'. */
  riskLevel?: unknown
  safetyStop?: unknown
  /** Agreed contract field: 'continue_diy' | 'contact_professional' | 'stop_and_make_safe'. */
  nextAction?: unknown
}

function fromLevel(value: unknown): RiskDecision {
  switch (value) {
    case 'low':
    case 'safe':
      return 'safe'
    case 'medium':
    case 'caution':
      return 'caution'
    case 'high':
    case 'professional':
      return 'professional'
    case 'emergency':
      return 'emergency'
    default:
      // Unknown value: fall back to the safer side.
      return 'professional'
  }
}

function fromNextAction(value: unknown): RiskDecision | null {
  if (value === undefined) return null
  switch (value) {
    case 'continue_diy':
      return 'safe'
    case 'contact_professional':
      return 'professional'
    case 'stop_and_make_safe':
      return 'emergency'
    default:
      return 'professional'
  }
}

/** Takes every signal present and returns the most severe one. */
export function decideRisk(input: DecisionInput): RiskDecision {
  const candidates: RiskDecision[] = []
  const hasLevel = input.severity !== undefined || input.riskLevel !== undefined

  if (input.severity !== undefined) candidates.push(fromLevel(input.severity))
  if (input.riskLevel !== undefined) candidates.push(fromLevel(input.riskLevel))
  // No usable risk data at all: treat as unknown, which means the safer side.
  if (!hasLevel) candidates.push('professional')
  // safetyStop: true, or any value that is not an explicit false, blocks.
  if (input.safetyStop !== undefined && input.safetyStop !== false) candidates.push('professional')

  const action = fromNextAction(input.nextAction)
  if (action) candidates.push(action)

  return mostSevere('safe', ...candidates)
}

export interface AgreedRiskFields {
  riskLevel?: unknown
  nextAction?: unknown
}

/** Decision for a stored/returned diagnosis, optionally with agreed-contract fields. */
export function decideFromDiagnosis(
  diagnosis: Pick<DiagnosisResult, 'severity' | 'safetyStop'> | null | undefined,
  extras?: AgreedRiskFields | null
): RiskDecision {
  if (!diagnosis || typeof diagnosis !== 'object') return 'professional'
  return decideRisk({
    severity: diagnosis.severity,
    safetyStop: diagnosis.safetyStop,
    riskLevel: extras?.riskLevel,
    nextAction: extras?.nextAction,
  })
}

/**
 * Applies a newer server decision on top of the current one.
 * - A blocked session is never changed by a later response (no downgrade).
 * - Otherwise the server's latest decision is shown as-is, more or less severe.
 * The client never computes a lower decision itself.
 */
export function nextDecision(current: RiskDecision, serverLatest: RiskDecision): RiskDecision {
  if (isBlocked(current)) return mostSevere(current, serverLatest)
  return serverLatest
}
