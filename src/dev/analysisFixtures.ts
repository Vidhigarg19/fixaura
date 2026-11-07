// DEV-ONLY test data. This file is only reachable through dynamic imports that sit behind
// `import.meta.env.DEV` (CameraCapture, useDiagnosisSource, followUpClient), so it is not
// part of a production build. Strings here are test data and are intentionally not translated.
//
// It models the AGREED contract (not the shape the live service returns today):
//   success { ok:true,  data:{ sessionId, observations[], possibleCauses[], evidenceStrength,
//                              limitations[], riskLevel, safetyReasons[], nextAction,
//                              followUpQuestions[], approvedTemplateId|null, policyVersion } }
//   failure { ok:false, error:{ code, retryable, retryAfterSeconds? } }
import { errorFromEnvelope } from '../services/analysisContract'
import { AnalysisError } from '../types/analysis'
import type { DiagnosisResult } from '../types/repair'
import type { AgreedDiagnosis, Level } from '../utils/diagnosisView'
import { decideRisk, isBlocked } from '../utils/riskDecision'
import type { FollowUpAnswers, FollowUpQuestion } from '../utils/followUpValidation'

export const FIXTURE_NAMES = [
  'success',
  'blocked',
  'blocked_professional',
  'blocked_emergency',
  'needs_followup',
  'followup_escalates',
  'followup_error',
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

export type AgreedSuccessData = AgreedDiagnosis

type AgreedEnvelope =
  | { ok: true; data: AgreedSuccessData }
  | { ok: false; error: { code: string; retryable: boolean; retryAfterSeconds?: number } }

const failure = (code: string, retryable: boolean, retryAfterSeconds?: number): AgreedEnvelope => ({
  ok: false,
  error: retryAfterSeconds === undefined
    ? { code, retryable }
    : { code, retryable, retryAfterSeconds },
})

const DRIP_QUESTION: FollowUpQuestion = {
  id: 'drip_stops',
  type: 'yes_no',
  label: 'Does the drip stop when the tap is fully closed?',
  required: true,
}
const BURNING_QUESTION: FollowUpQuestion = {
  id: 'burning_smell',
  type: 'yes_no',
  label: 'Do you smell burning or see smoke near it?',
  required: true,
}
const WHEN_QUESTION: FollowUpQuestion = {
  id: 'when_started',
  type: 'single_choice',
  label: 'When did this start?',
  options: ['Today', 'This week', 'Longer ago'],
  required: true,
}

const TAP_BASE: AgreedSuccessData = {
  sessionId: 'fixture-session-1',
  observations: ['Water staining around the base of the tap.', 'The aerator looks loose.'],
  possibleCauses: ['Worn washer', 'Loose aerator'],
  evidenceStrength: 'medium',
  limitations: ['The photo does not show the shut-off valve.'],
  riskLevel: 'low',
  safetyReasons: [],
  nextAction: 'continue_diy',
  followUpQuestions: [],
  approvedTemplateId: 'fixture-template-tap',
  policyVersion: 'fixture-policy-1',
}

const SOCKET_BASE: AgreedSuccessData = {
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
}

const GAS_BASE: AgreedSuccessData = {
  sessionId: 'fixture-session-3',
  observations: ['A hissing sound was described near the gas hob connection.'],
  possibleCauses: ['Gas leak at the connection'],
  evidenceStrength: 'high',
  limitations: ['A photo cannot confirm a gas leak.'],
  riskLevel: 'high',
  safetyReasons: ['Possible gas leak.', 'Do not use switches or flames.'],
  nextAction: 'stop_and_make_safe',
  followUpQuestions: [],
  approvedTemplateId: null,
  policyVersion: 'fixture-policy-1',
}

export const FIXTURES: Record<FixtureName, AgreedEnvelope> = {
  success: { ok: true, data: { ...TAP_BASE } },
  blocked: { ok: true, data: { ...SOCKET_BASE } },
  blocked_professional: { ok: true, data: { ...SOCKET_BASE, sessionId: 'fixture-session-4' } },
  blocked_emergency: { ok: true, data: { ...GAS_BASE } },
  needs_followup: {
    ok: true,
    data: { ...TAP_BASE, sessionId: 'fixture-session-5', followUpQuestions: [DRIP_QUESTION, WHEN_QUESTION] },
  },
  followup_escalates: {
    ok: true,
    data: {
      ...TAP_BASE,
      sessionId: 'fixture-session-6',
      riskLevel: 'medium',
      evidenceStrength: 'low',
      followUpQuestions: [BURNING_QUESTION, WHEN_QUESTION],
    },
  },
  followup_error: {
    ok: true,
    data: { ...TAP_BASE, sessionId: 'fixture-session-7', followUpQuestions: [DRIP_QUESTION, WHEN_QUESTION] },
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
 * Test-only approximation: confidence is a coarse number derived from evidenceStrength, and
 * a few test tools are added when an approved template exists so /tools has content.
 */
export function adaptAgreedContract(data: AgreedSuccessData): DiagnosisResult {
  const blocked = isBlocked(decideRisk({ riskLevel: data.riskLevel, nextAction: data.nextAction }))
  return {
    issueName: data.possibleCauses[0] ?? data.observations[0] ?? '',
    confidence: CONFIDENCE_FROM_EVIDENCE[data.evidenceStrength],
    summary: data.observations.join(' '),
    severity: data.riskLevel,
    recommendedFix: `Test fix for: ${data.possibleCauses[0] ?? 'the problem'}`,
    recommendedTools: data.approvedTemplateId
      ? ['Adjustable wrench', 'Work gloves', 'Bucket']
      : [],
    nextStepAdvice: 'Test advice from the fixture.',
    safetyWarning: data.safetyReasons.join(' '),
    explanation: data.limitations.join(' '),
    safetyStop: blocked,
  }
}

export interface FixtureOutcome {
  name: FixtureName
  data: AgreedSuccessData
  adapted: DiagnosisResult
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * Resolves a fixture without calling the real service and without saving anything.
 * Failure fixtures go through the same envelope -> AnalysisError path as the real client.
 */
export async function runFixture(name: string, delaySeconds: number): Promise<FixtureOutcome> {
  await wait(Math.min(30, Math.max(0, delaySeconds)) * 1000)
  // An unknown fixture name must never fall through to the real service.
  if (!isFixtureName(name)) throw new AnalysisError('invalid_input', false)

  const envelope = FIXTURES[name]
  if (!envelope.ok) {
    throw errorFromEnvelope(envelope) ?? new AnalysisError('invalid_response', true)
  }
  return { name, data: envelope.data, adapted: adaptAgreedContract(envelope.data) }
}

const FOLLOW_UP_DELAY_MS = 700

function outcomeFrom(name: FixtureName, data: AgreedSuccessData): FixtureOutcome {
  return { name, data, adapted: adaptAgreedContract(data) }
}

/**
 * Simulated follow-up submission (the real endpoint does not exist yet).
 * - followup_error: always fails with service_unavailable.
 * - followup_escalates: answering "yes" to burning_smell returns a blocked professional
 *   decision; any other answers return a lower, safe decision (the server's latest).
 * - needs_followup: returns a safe decision with no more questions.
 */
export async function runFollowUpFixture(
  name: string,
  request: { sessionId: string; answers: FollowUpAnswers }
): Promise<FixtureOutcome> {
  await wait(FOLLOW_UP_DELAY_MS)
  if (!isFixtureName(name)) throw new AnalysisError('invalid_input', false)
  if (name === 'followup_error') throw new AnalysisError('service_unavailable', true)

  const settled: AgreedSuccessData = {
    ...TAP_BASE,
    sessionId: request.sessionId,
    evidenceStrength: 'medium',
    riskLevel: 'low',
    followUpQuestions: [],
  }

  if (name === 'followup_escalates') {
    if (request.answers.burning_smell === 'yes') {
      return outcomeFrom(name, {
        ...SOCKET_BASE,
        sessionId: request.sessionId,
        observations: ['You reported a burning smell.'],
        safetyReasons: ['Burning smell reported.', 'Do not use it until it is checked.'],
      })
    }
    return outcomeFrom(name, settled)
  }
  if (name === 'needs_followup') return outcomeFrom(name, settled)

  // Any other fixture has no follow-up behaviour.
  throw new AnalysisError('invalid_input', false)
}
