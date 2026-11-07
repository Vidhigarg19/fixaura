import { isAnalysisError } from '../types/analysis'

// Maps failures from the analysis service (Swapnil's typed AnalysisError) to the small
// set of user-facing kinds the capture page can explain. Raw error text is never used.

export type AnalysisErrorKind =
  | 'offline'
  | 'unauthenticated'
  | 'invalid_input'
  | 'busy'
  | 'unavailable'

export interface AnalysisFailure {
  kind: AnalysisErrorKind
  code: string | undefined
  retryable: boolean
  /** Only set when the service supplied trusted retry timing. */
  retryAfterSeconds: number | undefined
}

/** Locale keys for the body line of each kind. */
export const ANALYSIS_ERROR_MESSAGE_KEYS: Record<AnalysisErrorKind, string> = {
  offline: 'capture.analysisErrorOffline',
  unauthenticated: 'capture.analysisErrorUnauthenticated',
  invalid_input: 'capture.analysisErrorInvalidInput',
  busy: 'capture.analysisErrorBusy',
  unavailable: 'capture.analysisErrorUnavailable',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function kindFromCode(code: string): AnalysisErrorKind | null {
  switch (code) {
    case 'rate_limited':
    case 'quota_exceeded':
      return 'busy'
    case 'unauthenticated':
      return 'unauthenticated'
    case 'invalid_input':
      return 'invalid_input'
    case 'forbidden':
    case 'service_unavailable':
    case 'invalid_response':
    case 'configuration_error':
      return 'unavailable'
    default:
      return null
  }
}

function kindFromStatus(status: number): AnalysisErrorKind | null {
  if (status === 401) return 'unauthenticated'
  if (status === 429) return 'busy'
  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return 'invalid_input'
  }
  return null
}

function readStatus(record: Record<string, unknown>): number | undefined {
  if (typeof record.status === 'number') return record.status
  const context = asRecord(record.context)
  return typeof context?.status === 'number' ? context.status : undefined
}

/** Never reads error.message. Falls back to "unavailable". */
export function mapAnalysisError(error: unknown): AnalysisErrorKind {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'

  if (isAnalysisError(error)) return kindFromCode(error.code) ?? 'unavailable'

  const record = asRecord(error)
  if (record) {
    if (typeof record.code === 'string') {
      const fromCode = kindFromCode(record.code.toLowerCase())
      if (fromCode) return fromCode
    }
    const status = readStatus(record)
    if (status !== undefined) return kindFromStatus(status) ?? 'unavailable'
  }
  return 'unavailable'
}

export function describeAnalysisFailure(error: unknown): AnalysisFailure {
  const kind = mapAnalysisError(error)
  if (isAnalysisError(error)) {
    return {
      kind,
      code: error.code,
      retryable: error.retryable,
      retryAfterSeconds: error.retryAfterSeconds,
    }
  }
  return { kind, code: undefined, retryable: true, retryAfterSeconds: undefined }
}

/** Whether a "Try again" button helps. Hidden for failures the user cannot fix by retrying. */
export function canRetryAnalysis(failure: AnalysisFailure): boolean {
  if (failure.kind === 'unauthenticated') return false
  return failure.retryable || failure.kind === 'invalid_input' || failure.kind === 'offline'
}

/** quota_exceeded gets its own, more accurate sentence; everything else uses its kind. */
export function analysisErrorMessageKey(failure: AnalysisFailure): string {
  if (failure.code === 'quota_exceeded') return 'capture.analysisQuotaExceeded'
  return ANALYSIS_ERROR_MESSAGE_KEYS[failure.kind]
}
