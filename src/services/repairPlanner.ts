import type { DiagnosisResult, RepairStep } from '../types/repair'
import { MIN_GUIDE_STEPS, parseGuideSteps } from '../utils/guideSteps'
import { buildFallbackGuide, buildSafetyStep } from '../utils/fallbackGuide'

/**
 * Builds the step-by-step guide for a result. Order of preference:
 *  1. The issue-specific, validated steps the analysis returned for THIS problem.
 *  2. A fallback guide built from the diagnosis itself (issue, recommended fix, tools,
 *     next-step advice), so a missing checklist never leaves the user without steps.
 * A blocked result (safetyStop or high severity), or one whose fix describes a
 * hazardous action, has NO steps. Every guide starts with a context-aware "get ready
 * safely" step (unplug, shut off water, protective gear).
 */
export function buildRepairPlan(diagnosis: DiagnosisResult): RepairStep[] {
  if (diagnosis.safetyStop || diagnosis.severity === 'high') return []

  const generated = parseGuideSteps(diagnosis.guideSteps)
  if (generated.length >= MIN_GUIDE_STEPS) return [buildSafetyStep(diagnosis), ...generated]

  return buildFallbackGuide(diagnosis)
}

export function getPrepTimeMinutes(tools: string[]): number {
  return Math.max(5, Math.ceil(tools.length * 1.5))
}

export function isEssentialTool(tool: string): boolean {
  const lower = tool.toLowerCase()
  return (
    lower.includes('glove') ||
    lower.includes('shutoff') ||
    lower.includes('breaker') ||
    lower.includes('multimeter') ||
    lower.includes('safety')
  )
}
