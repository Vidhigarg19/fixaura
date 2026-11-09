import type { RepairStep } from '../types/repair'

// Pure validation for model-authored guide steps. Mirrors parseGuideSteps in
// supabase/functions/analyze-image/logic.ts so a malformed or half-formed guide is
// rejected on both sides. Fewer than MIN_GUIDE_STEPS valid steps means NO guide.

export const MIN_GUIDE_STEPS = 3
const MAX_GUIDE_STEPS = 10
const CUES: ReadonlyArray<RepairStep['visualCue']> = ['arrow', 'box', 'circle', 'line']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseGuideSteps(raw: unknown): RepairStep[] {
  if (!Array.isArray(raw)) return []
  const steps: RepairStep[] = []
  for (const item of raw) {
    if (steps.length >= MAX_GUIDE_STEPS) break
    if (!isRecord(item)) continue
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 80) : ''
    const instruction = typeof item.instruction === 'string' ? item.instruction.trim().slice(0, 500) : ''
    if (!title || !instruction) continue
    const seconds =
      typeof item.estimatedSeconds === 'number' && Number.isFinite(item.estimatedSeconds)
        ? Math.round(Math.min(3600, Math.max(10, item.estimatedSeconds)))
        : 120
    steps.push({
      // Ids are assigned here, never trusted from the payload.
      id: `step-${steps.length + 1}`,
      title,
      instruction,
      safetyNote: typeof item.safetyNote === 'string' ? item.safetyNote.trim().slice(0, 240) : '',
      requiresConfirmation: item.requiresConfirmation === true,
      visualCue: CUES.find((cue) => cue === item.visualCue) ?? 'circle',
      estimatedSeconds: seconds,
    })
  }
  return steps.length >= MIN_GUIDE_STEPS ? steps : []
}
