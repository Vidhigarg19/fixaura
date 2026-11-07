// Shared analysis error contract (Swapnil <-> Vidhi). Server ke error codes se match karta hai.

export const ANALYSIS_ERROR_CODES = [
  'invalid_input',
  'unauthenticated',
  'forbidden',
  'rate_limited',
  'quota_exceeded',
  'service_unavailable',
  'invalid_response',
  'configuration_error',
] as const

export type AnalysisErrorCode = (typeof ANALYSIS_ERROR_CODES)[number]

export function isAnalysisErrorCode(value: unknown): value is AnalysisErrorCode {
  return typeof value === 'string' && (ANALYSIS_ERROR_CODES as readonly string[]).includes(value)
}

// Safe, generic messages. UI (V01) inhe localized text se replace karegi; raw provider text kabhi nahi.
const DEFAULT_MESSAGES: Record<AnalysisErrorCode, string> = {
  invalid_input: 'The photo or description could not be used. Please check them and try again.',
  unauthenticated: 'Please sign in to analyze a photo.',
  forbidden: 'You do not have access to this action.',
  rate_limited: 'Too many requests right now. Please wait a moment and try again.',
  quota_exceeded: 'Analysis is temporarily unavailable. Please try again later.',
  service_unavailable: 'The analysis service is unavailable. Please try again.',
  invalid_response: 'The analysis did not return a usable result. Please try again.',
  configuration_error: 'Analysis is not set up correctly right now.',
}

// NOTE: erasableSyntaxOnly on hai, isliye constructor parameter properties use nahi kiye.
export class AnalysisError extends Error {
  code: AnalysisErrorCode
  retryable: boolean
  retryAfterSeconds?: number

  constructor(code: AnalysisErrorCode, retryable: boolean, retryAfterSeconds?: number) {
    super(DEFAULT_MESSAGES[code])
    this.name = 'AnalysisError'
    this.code = code
    this.retryable = retryable
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function isAnalysisError(value: unknown): value is AnalysisError {
  return value instanceof AnalysisError
}
