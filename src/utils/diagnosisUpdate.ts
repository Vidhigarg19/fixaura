import type { DiagnosisResult } from '../types/repair'
import type { AgreedDiagnosis } from './diagnosisView'
import { decideFromDiagnosis, isBlocked } from './riskDecision'

export interface DiagnosisState {
  diagnosis: DiagnosisResult
  extras: AgreedDiagnosis | null
}

export interface UpdateResult {
  accepted: boolean
  state: DiagnosisState
}

/**
 * Applies a newer server result on top of the current diagnosis.
 * - A blocked session is NEVER changed by a later response: no downgrade, no replacement.
 * - Otherwise the server's latest result is taken as-is (more or less severe). The client
 *   never computes a lower decision on its own.
 * - A result that is blocked is stored with safetyStop = true so the block is sticky in
 *   anything that is persisted.
 */
export function applyDiagnosisUpdate(current: DiagnosisState, update: DiagnosisState): UpdateResult {
  if (isBlocked(decideFromDiagnosis(current.diagnosis, current.extras))) {
    return { accepted: false, state: current }
  }
  const after = decideFromDiagnosis(update.diagnosis, update.extras)
  const diagnosis = isBlocked(after) ? { ...update.diagnosis, safetyStop: true } : update.diagnosis
  return { accepted: true, state: { diagnosis, extras: update.extras } }
}
