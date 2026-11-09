import type { DiagnosisResult, RepairStep } from '../types/repair'
import { t } from '../i18n'
import { screenFields, screenText } from '../lib/safety'

// Fallback repair guide.
//
// Used whenever there is no approved checklist and the analysis returned no usable
// issue-specific steps. A low or medium risk result must NEVER be left without
// guidance, so this builds a clear, ordered, safe guide from the diagnosis itself and,
// as a last resort, from the issue name alone.
//
// Guardrails (a fallback must never be less safe than the rest of the app):
//  - A critical result never gets a guide: safetyStop / high severity, or an issue
//    name or summary that itself reports a genuine hazard (live wires, a gas leak,
//    sparking, smoke ...). Those results are blocked upstream with the safety panel.
//  - A single hazardous SENTENCE in the recommended fix or advice is dropped rather
//    than shown; the rest of the guide is still built.
//  - Every guide starts with a context-aware "get ready safely" step (unplug, shut
//    off water, protective gear), ends with a cautious test step, and ends with a
//    clear "if it is still not fixed" step that sends the user to a professional.
//  - The repair actions are the diagnosis's own text, split into steps. When there is
//    none, the steps are neutral inspect / clean / reseat actions about the named issue.

const MIN_TEXT_LENGTH = 10
const MAX_FIX_STEPS = 5
const MAX_TOOLS_LISTED = 8

const WATER_RE = /\b(leak\w*|pipe|faucet|tap|drain\w*|sink|tank|hose|valve|flush|toilet|shower|plumbing|water)\b/i
const SHARP_RE = /\b(blade|glass|cut|saw|drill|screw\w*|nail\w*|hinge|metal|sharp|tile|chisel|cutter)\b/i

function contextText(d: DiagnosisResult): string {
  return [d.issueName, d.summary, d.recommendedFix, ...(d.recommendedTools ?? [])].join(' ')
}

/** Splits free text into short action sentences (no regex lookbehind, for older browsers). */
function toSentences(text: string | undefined): string[] {
  const parts = (text ?? '').match(/[^.!?\n]+[.!?]*/g) ?? []
  return parts.map((part) => part.trim()).filter((part) => part.length >= 3)
}

/** Sentences that do NOT themselves describe a hazardous action or condition. */
function safeSentences(text: string | undefined): string[] {
  return toSentences(text).filter((sentence) => !screenText(sentence).blocked)
}

/**
 * Whether a fallback guide can be built for this result. Pure (no translations), so the
 * availability gate can call it cheaply. True for every non-critical result.
 */
export function canBuildFallbackGuide(d: DiagnosisResult | null | undefined): boolean {
  if (!d) return false
  if (d.safetyStop || d.severity === 'high') return false
  if ((d.issueName ?? '').trim().length === 0) return false
  // A reported hazard in what the analysis OBSERVED is a critical result, not a repair.
  return !screenFields([d.issueName, d.summary]).blocked
}

/** The context-aware first step: power off / unplug, water, protective gear. */
export function buildSafetyStep(d: DiagnosisResult): RepairStep {
  const text = contextText(d)
  const lines = [t('guide.safetyStepInstruction')]
  if (WATER_RE.test(text)) lines.push(t('guide.fbGuide.waterLine'))
  if (SHARP_RE.test(text)) lines.push(t('guide.fbGuide.sharpLine'))
  lines.push(t('guide.fbGuide.protectLine'))
  return {
    id: 'safety-0',
    title: t('guide.safetyStepTitle'),
    instruction: lines.join(' '),
    safetyNote: t('guide.safetyStepNote'),
    requiresConfirmation: true,
    visualCue: 'box',
    estimatedSeconds: 90,
  }
}

/**
 * Builds the fallback guide, or [] only for a critical result (see canBuildFallbackGuide).
 * Always contains at least: safety, inspect, one or more repair actions, test, if-not-fixed.
 */
export function buildFallbackGuide(d: DiagnosisResult): RepairStep[] {
  if (!canBuildFallbackGuide(d)) return []

  const issue = d.issueName.trim()
  const steps: RepairStep[] = [buildSafetyStep(d)]

  const tools = (d.recommendedTools ?? [])
    .map((tool) => tool.trim())
    .filter(Boolean)
    .slice(0, MAX_TOOLS_LISTED)
  if (tools.length > 0) {
    steps.push({
      id: 'fallback-tools',
      title: t('guide.fbGuide.toolsTitle'),
      instruction: t('guide.fbGuide.toolsInstruction').replace('{tools}', tools.join(', ')),
      safetyNote: '',
      requiresConfirmation: false,
      visualCue: 'box',
      estimatedSeconds: 120,
    })
  }

  // Inspect: name the issue and, when the analysis noted something, say what it noted.
  const noticed = safeSentences(d.summary).join(' ').slice(0, 300)
  const inspect = [
    t('guide.fbGuide.inspectInstruction').replace('{issue}', issue),
    noticed.length >= MIN_TEXT_LENGTH ? t('guide.fbGuide.noticedLine').replace('{summary}', noticed) : '',
  ]
    .filter(Boolean)
    .join(' ')
  steps.push({
    id: 'fallback-inspect',
    title: t('guide.fbGuide.inspectTitle'),
    instruction: inspect.slice(0, 500),
    safetyNote: '',
    requiresConfirmation: false,
    visualCue: 'circle',
    estimatedSeconds: 120,
  })

  // Repair actions: the recommended fix, else the next-step advice, else neutral steps
  // about the named issue so a result with no fix text still gets guidance.
  const fixes = safeSentences(d.recommendedFix).slice(0, MAX_FIX_STEPS)
  const advice = safeSentences(d.nextStepAdvice)
  const actions = fixes.length > 0 ? fixes : advice.slice(0, 3)

  if (actions.length > 0) {
    actions.forEach((sentence, index) => {
      steps.push({
        id: `fallback-fix-${index + 1}`,
        title: actions.length > 1
          ? `${t('guide.fbGuide.fixTitle')} (${index + 1}/${actions.length})`
          : t('guide.fbGuide.fixTitle'),
        instruction: sentence.slice(0, 500),
        // The model's own safety warning rides along with the first action, unscreened:
        // it is guidance for the user, not evidence of a hazard.
        safetyNote: index === 0 ? (d.safetyWarning ?? '').trim().slice(0, 240) : '',
        requiresConfirmation: index === 0,
        visualCue: 'arrow',
        estimatedSeconds: 180,
      })
    })
  } else {
    steps.push(
      {
        id: 'fallback-check',
        title: t('guide.fbGuide.genericCheckTitle'),
        instruction: t('guide.fbGuide.genericCheckInstruction').replace('{issue}', issue),
        safetyNote: (d.safetyWarning ?? '').trim().slice(0, 240),
        requiresConfirmation: true,
        visualCue: 'arrow',
        estimatedSeconds: 180,
      },
      {
        id: 'fallback-clean',
        title: t('guide.fbGuide.genericCleanTitle'),
        instruction: t('guide.fbGuide.genericCleanInstruction'),
        safetyNote: '',
        requiresConfirmation: false,
        visualCue: 'arrow',
        estimatedSeconds: 180,
      }
    )
  }

  // Extra advice is shown after the actions, but not when it was already used as them.
  if (fixes.length > 0 && advice.length > 0) {
    steps.push({
      id: 'fallback-advice',
      title: t('guide.fbGuide.adviceTitle'),
      instruction: advice.join(' ').slice(0, 500),
      safetyNote: '',
      requiresConfirmation: false,
      visualCue: 'circle',
      estimatedSeconds: 90,
    })
  }

  steps.push(
    {
      id: 'fallback-test',
      title: t('guide.fbGuide.testTitle'),
      instruction: t('guide.fbGuide.testInstruction'),
      safetyNote: t('guide.fbGuide.testNote'),
      requiresConfirmation: false,
      visualCue: 'line',
      estimatedSeconds: 180,
    },
    {
      id: 'fallback-cleanup',
      title: t('guide.fbGuide.cleanupTitle'),
      instruction: t('guide.fbGuide.cleanupInstruction'),
      safetyNote: '',
      requiresConfirmation: false,
      visualCue: 'box',
      estimatedSeconds: 120,
    },
    {
      id: 'fallback-help',
      title: t('guide.fbGuide.helpTitle'),
      instruction: t('guide.fbGuide.helpInstruction'),
      safetyNote: '',
      requiresConfirmation: false,
      visualCue: 'circle',
      estimatedSeconds: 30,
    }
  )

  return steps
}
