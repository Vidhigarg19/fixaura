import type { DiagnosisResult } from '../types/repair'
import { safetyRiskSignal, screenFields } from '../lib/safety'
import type { DiagnosisView } from './diagnosisView'
import { mostSevere, type RiskDecision } from './riskDecision'

// One place that answers "is this result a genuine hazard?" for every page.
//
// The decision is the MOST SEVERE of
//  - the stored risk decision (severity / safetyStop / agreed fields), and
//  - the hazard screen of what the user reported and what the analysis observed.
// It is never lowered. A low or medium result with no critical hazard comes out as
// 'safe' or 'caution', both of which get a repair guide. Only 'professional' and
// 'emergency' block, and they block with the safety panel, never with a
// "guided repair is not available" message.

/** The hazard-screen signal for a result (user report + observed text; not boilerplate). */
export function textRiskSignal(diagnosis: DiagnosisResult, description?: string): RiskDecision {
  return safetyRiskSignal(
    screenFields([description, diagnosis.issueName, diagnosis.summary, diagnosis.recommendedFix])
  )
}

/** Applies the hazard screen on top of a built view, so every page blocks the same way. */
export function withTextScreen(
  view: DiagnosisView,
  diagnosis: DiagnosisResult,
  description?: string
): DiagnosisView {
  return { ...view, decision: mostSevere(view.decision, textRiskSignal(diagnosis, description)) }
}
