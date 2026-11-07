// Pure helpers (koi Deno/Supabase global nahi) - isliye Node se bhi test ho sakte hain.

export const ERROR_CODES = [
  'invalid_input',
  'unauthenticated',
  'forbidden',
  'rate_limited',
  'quota_exceeded',
  'service_unavailable',
  'invalid_response',
  'configuration_error',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export interface ApiError {
  code: ErrorCode
  retryable: boolean
  retryAfterSeconds?: number
}

export const HTTP_STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  unauthenticated: 401,
  forbidden: 403,
  rate_limited: 429,
  quota_exceeded: 429,
  service_unavailable: 503,
  invalid_response: 502,
  configuration_error: 500,
}

export function makeError(code: ErrorCode, retryable: boolean, retryAfterSeconds?: number): ApiError {
  return retryAfterSeconds === undefined
    ? { code, retryable }
    : { code, retryable, retryAfterSeconds }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// "34s" / "34.5s" -> 35 (sirf trusted provider metadata se)
export function parseRetryDelaySeconds(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim())
  if (!match) return undefined
  const seconds = Math.ceil(Number(match[1]))
  return seconds > 0 && seconds <= 3600 ? seconds : undefined
}

function parseRetryAfterHeader(value: string | null): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && n <= 3600 ? Math.ceil(n) : undefined
}

// Provider (Gemini) ke HTTP failure ko hamare error codes mein convert karta hai.
// Provider ka raw text user ko kabhi nahi jaata.
export function mapProviderFailure(
  status: number,
  bodyText: string,
  retryAfterHeader: string | null
): ApiError {
  const root = asRecord(parseJson(bodyText))
  const err = asRecord(root?.error)
  const message = typeof err?.message === 'string' ? err.message.toLowerCase() : ''
  const providerStatus = typeof err?.status === 'string' ? err.status : ''

  let retryDelay = parseRetryAfterHeader(retryAfterHeader)
  if (retryDelay === undefined && Array.isArray(err?.details)) {
    for (const detail of err.details) {
      const seconds = parseRetryDelaySeconds(asRecord(detail)?.retryDelay)
      if (seconds !== undefined) {
        retryDelay = seconds
        break
      }
    }
  }

  if (status === 429 || providerStatus === 'RESOURCE_EXHAUSTED') {
    // Rate limit (thodi der mein theek) aur quota khatam (jaldi theek nahi hoga) alag rakho.
    const exhausted = /per day|daily|billing|plan/.test(message)
    if (retryDelay !== undefined && !exhausted) return makeError('rate_limited', true, retryDelay)
    return makeError('quota_exceeded', false)
  }
  if (status === 401 || status === 403 || status === 404) return makeError('configuration_error', false)
  if (status === 400) {
    if (/api key|api_key/.test(message) || providerStatus === 'FAILED_PRECONDITION') {
      return makeError('configuration_error', false)
    }
    return makeError('invalid_input', false)
  }
  if (status === 413) return makeError('invalid_input', false)
  if (status === 408 || status >= 500) return makeError('service_unavailable', true)
  return makeError('service_unavailable', false)
}

export const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
export const MAX_BASE64_CHARS = 10_000_000
export const MAX_DESCRIPTION_CHARS = 500

export interface AnalyzeRequest {
  imageBase64: string
  mediaType: string
  description: string
}

export function validateRequest(body: unknown): AnalyzeRequest | null {
  const r = asRecord(body)
  if (!r) return null
  const { imageBase64, mediaType, description } = r
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0 || imageBase64.length > MAX_BASE64_CHARS) {
    return null
  }
  if (typeof description !== 'string') return null
  const trimmed = description.trim()
  if (!trimmed || trimmed.length > MAX_DESCRIPTION_CHARS) return null
  let type = 'image/jpeg'
  if (mediaType !== undefined) {
    if (typeof mediaType !== 'string' || !ALLOWED_MEDIA_TYPES.includes(mediaType)) return null
    type = mediaType
  }
  return { imageBase64, mediaType: type, description: trimmed }
}

export interface DiagnosisPayload {
  issueName: string
  confidence: number
  summary: string
  severity: 'low' | 'medium' | 'high'
  recommendedFix: string
  recommendedTools: string[]
  nextStepAdvice: string
  safetyWarning: string
  explanation: string
}

export function parseModelJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  return parseJson(text.slice(start, end + 1))
}

// Strict validation: koi field missing ho to default bharke fake diagnosis nahi banate.
export function validateDiagnosis(raw: unknown): DiagnosisPayload | null {
  const r = asRecord(raw)
  if (!r) return null
  const str = (v: unknown): string | null => (typeof v === 'string' ? v.trim() : null)

  const issueName = str(r.issueName)
  const summary = str(r.summary)
  const recommendedFix = str(r.recommendedFix)
  const nextStepAdvice = str(r.nextStepAdvice)
  const safetyWarning = str(r.safetyWarning)
  const explanation = str(r.explanation)
  const severity = typeof r.severity === 'string' ? r.severity.toLowerCase() : ''

  if (!issueName || !summary || !recommendedFix) return null
  if (nextStepAdvice === null || safetyWarning === null || explanation === null) return null
  if (severity !== 'low' && severity !== 'medium' && severity !== 'high') return null
  if (typeof r.confidence !== 'number' || !Number.isFinite(r.confidence)) return null
  if (!Array.isArray(r.recommendedTools) || !r.recommendedTools.every((t) => typeof t === 'string')) return null

  return {
    issueName,
    confidence: Math.round(Math.min(100, Math.max(0, r.confidence))),
    summary,
    severity,
    recommendedFix,
    recommendedTools: r.recommendedTools.map((t: string) => t.trim()).filter(Boolean),
    nextStepAdvice,
    safetyWarning,
    explanation,
  }
}

// ---------- S02 additions: quota, config parsing, safe logging ----------

export type QuotaResult = 'ok' | 'user_minute' | 'user_day' | 'global_day'

export interface QuotaLimits {
  userPerMinute: number
  userPerDay: number
  globalPerDay: number
}

// Defaults conservative hain. Asli free-tier limits AI Studio mein apne project ke liye dekho
// aur globalPerDay ko usse NEECHE rakho. Env se badalna ho to docs/analysis-env.md dekho.
export const DEFAULT_LIMITS: QuotaLimits = { userPerMinute: 3, userPerDay: 10, globalPerDay: 200 }

export function parsePositiveInt(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === '') return fallback
  const n = Number(value)
  if (!Number.isInteger(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// Per-minute limit ke liye hum khud jaante hain kab reset hoga -> trusted retry time.
export function secondsUntilNextMinute(now: Date): number {
  return Math.max(1, 60 - now.getUTCSeconds())
}

// Logs ke liye: provider error ka chhota, safe summary (image/key kabhi nahi).
export function providerErrorSummary(bodyText: string): { providerStatus?: string; message?: string } {
  const err = asRecord(asRecord(parseJson(bodyText))?.error)
  const out: { providerStatus?: string; message?: string } = {}
  if (typeof err?.status === 'string') out.providerStatus = err.status
  if (typeof err?.message === 'string') out.message = err.message.slice(0, 200)
  return out
}

// ConfigurationError ab shared hai (S04): Edge Functions ek hi class use karein.
export { ConfigurationError } from '../_shared/errors.ts'
