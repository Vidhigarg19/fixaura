import type { DiagnosisResult } from '../types/repair'
import type { AgreedDiagnosis } from './diagnosisView'
import { decideFromDiagnosis, isBlocked } from './riskDecision'
import { screenFields } from '../lib/safety'
import type { FollowUpAnswers } from './followUpValidation'

export interface DiagnosisState {
  diagnosis: DiagnosisResult
  extras: AgreedDiagnosis | null
}

export interface UpdateResult {
  accepted: boolean
  state: DiagnosisState
}

/** Flattens follow-up answers into plain strings for safety screening. */
function answerTexts(answers?: FollowUpAnswers): string[] {
  if (!answers) return []
  const out: string[] = []
  for (const value of Object.values(answers)) {
    if (Array.isArray(value)) out.push(...value)
    else if (typeof value === 'string') out.push(value)
  }
  return out
}

/**
 * Applies a newer server result on top of the current diagnosis.
 * - A blocked session is NEVER changed by a later response: no downgrade, no replacement.
 * - Otherwise the server's latest result is taken as-is (more or less severe). The client
 *   never computes a lower decision on its own.
 * - A result that is blocked is stored with safetyStop = true so the block is sticky in
 *   anything that is persisted.
 * - S07: the user's new answers are screened client-side with screenFields. A material
 *   hazard in the answers (gas/fire/electrical/...) ESCALATES the stored result to a safety
 *   stop even if the server's result did not. This is escalate-only; it can never lower the
 *   decision, matching the project's "client only escalates" safety rule.
 */
export function applyDiagnosisUpdate(
  current: DiagnosisState,
  update: DiagnosisState,
  answers?: FollowUpAnswers
): UpdateResult {
  if (isBlocked(decideFromDiagnosis(current.diagnosis, current.extras))) {
    return { accepted: false, state: current }
  }

  // Screen the user's new answers plus what the server OBSERVED (summary). The
  // server's boilerplate safetyWarning is not evidence of a hazard, so it is not
  // screened. Any professional/emergency finding forces a safety stop.
  const answerVerdict = screenFields([
    ...answerTexts(answers),
    update.diagnosis.summary,
  ])

  const after = decideFromDiagnosis(update.diagnosis, update.extras)
  const mustBlock = isBlocked(after) || answerVerdict.blocked
  const diagnosis = mustBlock
    ? { ...update.diagnosis, safetyStop: true }
    : update.diagnosis
  return { accepted: true, state: { diagnosis, extras: update.extras } }
}
