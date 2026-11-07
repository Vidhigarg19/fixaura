// DEV-ONLY test data. This file is imported dynamically from CameraCapture behind
// `import.meta.env.DEV`, so it is not part of a production build. Strings here are test
// data and are intentionally not translated.
//
// It models the AGREED contract (not the shape the live service returns today):
//   success { ok:true,  data:{ sessionId, observations[], possibleCauses[], evidenceStrength,
//                              limitations[], riskLevel, safetyReasons[], nextAction,
//                              followUpQuestions[], approvedTemplateId|null, policyVersion } }
//   failure { ok:false, error:{ code, retryable, retryAfterSeconds? } }
import { errorFromEnvelope } from '../services/analysisContract'
import { AnalysisError } from '../types/analysis'
import type { DiagnosisResult } from '../types/repair'

export const FIXTURE_NAMES = [
  'success',
  'blocked',
  'invalid_input',
  'unauthenticated',
  'rate_limited',
  'quota_exceeded',
  'service_unavailable',
  'invalid_response',
] as const

export type FixtureName = (typeof FIXTURE_NAMES)[number]

export function isFixtureName(value: unknown): value is FixtureName {
  return typeof value === 'string' && (FIXTURE_NAMES as readonly string[]).includes(value)
}

type Level = 'low' | 'medium' | 'high'
type NextAction = 'continue_diy' | 'contact_professional' | 'stop_and_make_safe'

export interface AgreedSuccessData {
  sessionId: string
  observations: string[]
  possibleCauses: string[]
  evidenceStrength: Level
  limitations: string[]
  riskLevel: Level
  safetyReasons: string[]
  nextAction: NextAction
  followUpQuestions: string[]
  approvedTemplateId: string | null
  policyVersion: string
}

type AgreedEnvelope =
  | { ok: true; data: AgreedSuccessData }
  | { ok: false; error: { code: string; retryable: boolean; retryAfterSeconds?: number } }

const failure = (code: string, retryable: boolean, retryAfterSeconds?: number): AgreedEnvelope => ({
  ok: false,
  error: retryAfterSeconds === undefined
    ? { code, retryable }
    : { code, retryable, retryAfterSeconds },
})

export const FIXTURES: Record<FixtureName, AgreedEnvelope> = {
  success: {
    ok: true,
    data: {
      sessionId: 'fixture-session-1',
      observations: ['Water staining around the base of the tap.', 'The aerator looks loose.'],
      possibleCauses: ['Worn washer', 'Loose aerator'],
      evidenceStrength: 'medium',
      limitations: ['The photo does not show the shut-off valve.'],
      riskLevel: 'low',
      safetyReasons: [],
      nextAction: 'continue_diy',
      followUpQuestions: ['Does the drip stop when the tap is fully closed?'],
      approvedTemplateId: 'fixture-template-tap',
      policyVersion: 'fixture-policy-1',
    },
  },
  blocked: {
    ok: true,
    data: {
      sessionId: 'fixture-session-2',
      observations: ['Scorch marks around a wall socket.'],
      possibleCauses: ['Overheated wiring'],
      evidenceStrength: 'high',
      limitations: [],
      riskLevel: 'high',
      safetyReasons: ['Possible electrical fault.', 'Do not touch the socket.'],
      nextAction: 'contact_professional',
      followUpQuestions: [],
      approvedTemplateId: null,
      policyVersion: 'fixture-policy-1',
    },
  },
  invalid_input: failure('invalid_input', false),
  unauthenticated: failure('unauthenticated', false),
  rate_limited: failure('rate_limited', true, 12),
  quota_exceeded: failure('quota_exceeded', false),
  service_unavailable: failure('service_unavailable', true),
  invalid_response: failure('invalid_response', true),
}

const CONFIDENCE_FROM_EVIDENCE: Record<Level, number> = { low: 35, medium: 60, high: 85 }

/**
 * Adapter: agreed contract -> the DiagnosisResult shape the existing pages understand.
 * Test-only approximation (e.g. confidence is a coarse number derived from evidenceStrength).
 */
export function adaptAgreedContract(data: AgreedSuccessData): DiagnosisResult {
  return {
    issueName: data.possibleCauses[0] ?? data.observations[0] ?? '',
    confidence: CONFIDENCE_FROM_EVIDENCE[data.evidenceStrength],
    summary: data.observations.join(' '),
    severity: data.riskLevel,
    recommendedFix: data.nextAction,
    recommendedTools: [],
    nextStepAdvice: data.followUpQuestions.join(' '),
    safetyWarning: data.safetyReasons.join(' '),
    explanation: data.limitations.join(' '),
    safetyStop: data.riskLevel === 'high' || data.nextAction !== 'continue_diy',
  }
}

export interface FixtureOutcome {
  name: FixtureName
  data: AgreedSuccessData
  adapted: DiagnosisResult
}

function wait(seconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000))
}

/**
 * Resolves a fixture without calling the real service and without saving anything.
 * Failure fixtures go through the same envelope -> AnalysisError path as the real client.
 */
export async function runFixture(name: string, delaySeconds: number): Promise<FixtureOutcome> {
  await wait(Math.min(30, Math.max(0, delaySeconds)))
  // An unknown fixture name must never fall through to the real service.
  if (!isFixtureName(name)) throw new AnalysisError('invalid_input', false)

  const envelope = FIXTURES[name]
  if (!envelope.ok) {
    throw errorFromEnvelope(envelope) ?? new AnalysisError('invalid_response', true)
  }
  return { name, data: envelope.data, adapted: adaptAgreedContract(envelope.data) }
}
