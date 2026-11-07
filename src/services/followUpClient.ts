import type { DiagnosisResult } from '../types/repair'
import type { AgreedDiagnosis } from '../utils/diagnosisView'
import type { FollowUpAnswers } from '../utils/followUpValidation'
import { readFixtureName } from '../utils/fixtureGate'

// Client for submitting follow-up answers.
//
// THE REAL ENDPOINT DOES NOT EXIST YET. Outside fixture mode this client never fakes a
// result: it throws FollowUpUnavailableError and the page keeps the existing diagnosis.
//
// Contract the backend should implement (same envelope as the analysis call):
//   Request  POST analyze-image  { mode: 'follow_up', sessionId, answers }
//            answers: Record<questionId, string | string[]>   (yes_no => "yes" | "no";
//            short_text is at most 200 characters; only ids the server asked for)
//   Success  { ok: true,  data: <full agreed diagnosis, re-evaluated with the answers> }
//            data.followUpQuestions may be empty; riskLevel / nextAction may be MORE or LESS
//            severe than before; the server owns the safety decision.
//   Failure  { ok: false, error: { code, retryable, retryAfterSeconds? } } using the same
//            codes as analysis, plus invalid_input for unknown ids or bad answers.
//   The server should be idempotent per (sessionId, answers) and must never trust the client
//   for risk. The client only escalates; it never lowers a blocked decision.

export interface FollowUpRequest {
  sessionId: string
  answers: FollowUpAnswers
}

export interface FollowUpResult {
  diagnosis: DiagnosisResult
  extras: AgreedDiagnosis | null
}

export class FollowUpUnavailableError extends Error {
  constructor() {
    super('follow_up_unavailable')
    this.name = 'FollowUpUnavailableError'
  }
}

export async function submitFollowUpAnswers(request: FollowUpRequest): Promise<FollowUpResult> {
  // DEV-ONLY: when every fixture gate passed, simulate. This branch is removed from
  // production builds because import.meta.env.DEV is false there.
  if (import.meta.env.DEV) {
    const fixtureName = readFixtureName()
    if (fixtureName) {
      const { runFollowUpFixture } = await import('../dev/analysisFixtures')
      const outcome = await runFollowUpFixture(fixtureName, request)
      return { diagnosis: outcome.adapted, extras: outcome.data }
    }
  }

  throw new FollowUpUnavailableError()
}
