import type { DiagnosisResult } from '../types/repair'
import { decideFromDiagnosis, type RiskDecision } from './riskDecision'
import { parseFollowUpQuestions, type FollowUpQuestion } from './followUpValidation'

// Adapter between what the backend returns today (DiagnosisResult) and the AGREED
// contract the new diagnosis screens are built against. The real service does not yet
// return the agreed fields, so every value here either comes from `extras` (agreed data,
// used by fixtures and, later, the backend) or from a clearly labelled approximation.

export type Level = 'low' | 'medium' | 'high'
export type NextAction = 'continue_diy' | 'contact_professional' | 'stop_and_make_safe'

/** The agreed success payload. */
export interface AgreedDiagnosis {
  sessionId: string
  observations: string[]
  possibleCauses: string[]
  evidenceStrength: Level
  limitations: string[]
  riskLevel: Level
  safetyReasons: string[]
  nextAction: NextAction
  followUpQuestions: FollowUpQuestion[]
  approvedTemplateId: string | null
  policyVersion: string
}

export interface DiagnosisView {
  sessionId: string | null
  observations: string[]
  possibleCauses: string[]
  evidence: Level
  limitations: string[]
  decision: RiskDecision
  /** Analysis text shown only as a secondary line ("Details from the analysis"). */
  analysisDetails: string
  followUps: FollowUpQuestion[]
}

/**
 * APPROXIMATION for today's backend, which has no evidenceStrength: a coarse bucket of the
 * existing confidence number. It is shown as a label only, never as a percentage.
 */
export function evidenceFromConfidence(confidence: number): Level {
  if (!Number.isFinite(confidence) || confidence < 40) return 'low'
  if (confidence < 70) return 'medium'
  return 'high'
}

function cleanList(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean)
}

export function buildDiagnosisView(
  diagnosis: DiagnosisResult,
  extras: AgreedDiagnosis | null
): DiagnosisView {
  const decision = decideFromDiagnosis(diagnosis, extras)

  if (extras) {
    const details = [diagnosis.safetyWarning, ...extras.safetyReasons]
    return {
      sessionId: extras.sessionId,
      observations: cleanList(extras.observations),
      possibleCauses: cleanList(extras.possibleCauses),
      evidence: extras.evidenceStrength,
      limitations: cleanList(extras.limitations),
      decision,
      analysisDetails: [...new Set(cleanList(details))].join(' ').slice(0, 400),
      followUps: parseFollowUpQuestions(extras.followUpQuestions),
    }
  }

  return {
    sessionId: null,
    observations: cleanList([diagnosis.summary]),
    possibleCauses: cleanList([diagnosis.issueName]),
    evidence: evidenceFromConfidence(diagnosis.confidence),
    limitations: [],
    decision,
    analysisDetails: (diagnosis.safetyWarning ?? '').trim().slice(0, 400),
    followUps: [],
  }
}
