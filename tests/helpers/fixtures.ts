import { saveSession } from '../../src/services/repairSession'
import type { DiagnosisResult } from '../../src/types/repair'
import { TEST_USER } from './supabaseMock'

export function makeDiagnosis(overrides: Partial<DiagnosisResult> = {}): DiagnosisResult {
  return {
    issueName: 'Dripping tap',
    confidence: 85,
    summary: 'The washer inside the tap looks worn.',
    severity: 'low',
    recommendedFix: 'Replace the washer.',
    recommendedTools: ['Adjustable wrench', 'Gloves'],
    nextStepAdvice: 'Turn off the water first.',
    safetyWarning: 'Turn off the water supply.',
    explanation: 'Water keeps escaping past the seal.',
    ...overrides,
  }
}

/** Puts a valid, signed-in-user diagnosis session in the browser cache (through the app's own helper). */
export function seedSession(
  diagnosis: Partial<DiagnosisResult> = {},
  extra: Record<string, unknown> = {}
) {
  saveSession({
    diagnosis: makeDiagnosis(diagnosis),
    ownerUserId: TEST_USER.id,
    diagnosisAttemptId: 'attempt-1',
    imageDataUrl: 'data:image/jpeg;base64,AAAA',
    description: 'The kitchen tap keeps dripping when closed.',
    ...extra,
  })
}
