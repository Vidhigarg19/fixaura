import type { DiagnosisResult, RepairStep } from '../types/repair'

export function buildRepairPlan(diagnosis: DiagnosisResult): RepairStep[] {
  const issue = diagnosis.issueName.toLowerCase()

  const base: RepairStep[] = [
    {
      id: 'prep-1',
      title: 'Prepare workspace',
      instruction: diagnosis.nextStepAdvice || 'Clear the area and lay out your tools within reach.',
      safetyNote: diagnosis.safetyWarning,
      requiresConfirmation: true,
      visualCue: 'box',
      estimatedSeconds: 120,
    },
    {
      id: 'inspect-1',
      title: 'Inspect the damage',
      instruction: `Examine ${diagnosis.issueName}. ${diagnosis.summary}`,
      safetyNote: 'Do not force components apart.',
      requiresConfirmation: false,
      visualCue: 'circle',
      estimatedSeconds: 90,
    },
    {
      id: 'fix-1',
      title: 'Apply the fix',
      instruction: diagnosis.recommendedFix,
      safetyNote: diagnosis.safetyWarning,
      requiresConfirmation: true,
      visualCue: 'arrow',
      estimatedSeconds: 300,
    },
    {
      id: 'test-1',
      title: 'Test operation',
      instruction: 'Restore power or water gradually and verify normal operation for 2–3 minutes.',
      safetyNote: 'Stand clear of moving parts during the test.',
      requiresConfirmation: false,
      visualCue: 'line',
      estimatedSeconds: 180,
    },
    {
      id: 'finish-1',
      title: 'Secure and clean up',
      instruction: 'Tighten fasteners to spec, replace covers, and dispose of debris safely.',
      safetyNote: 'Double-check that all panels are seated.',
      requiresConfirmation: false,
      visualCue: 'box',
      estimatedSeconds: 120,
    },
  ]

  if (issue.includes('leak') || issue.includes('pipe') || issue.includes('faucet')) {
    base.splice(1, 0, {
      id: 'water-1',
      title: 'Shut off water supply',
      instruction: 'Locate the shutoff valve and turn clockwise until fully closed.',
      safetyNote: 'Place a towel beneath connections before loosening.',
      requiresConfirmation: true,
      visualCue: 'arrow',
      estimatedSeconds: 60,
    })
  }

  if (issue.includes('electr') || issue.includes('outlet') || issue.includes('wire')) {
    base[0].safetyNote = 'Turn off power at the breaker and verify with a multimeter.'
    base[0].requiresConfirmation = true
  }

  return base
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
