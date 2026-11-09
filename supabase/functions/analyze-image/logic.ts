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
  severity: 'low' | 'medium' | 'high'
  summary: string
  recommendedFix: string
  recommendedTools: string[]
  nextStepAdvice: string
  safetyWarning: string
  explanation: string
  // S05: set by the server-side safety gate. The client already coerces
  // `safetyStop` true when severity === 'high', so this stays an optional
  // escalation signal that can only make the result safer, never riskier.
  safetyStop?: boolean
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

// ---------- S05 additions: server-side safety gate ----------
//
// Pure moderation screening. This mirrors the client policy in
// src/lib/safety.ts. Deno Edge Functions cannot import from the Vite `src/`
// tree, so the rule source is duplicated here deliberately; keep the two in
// sync and bump SAFETY_POLICY_VERSION in both when the rules change.
// NOTE: tests in logic_test.ts lock this behavior.

export const SAFETY_POLICY_VERSION = 's05.1'

export type SafetyLevel = 'caution' | 'professional' | 'emergency'

interface SafetyRule {
  level: SafetyLevel
  phrases: string[]
}

const SAFETY_RULES: SafetyRule[] = [
  {
    level: 'emergency',
    phrases: [
      'gas smell', 'smell of gas', 'smell gas', 'smelling gas', 'gas leak',
      'lpg leak', 'cylinder leak', 'gas cylinder leak',
      'burning smell', 'smells burnt', 'smell burning', 'on fire', 'caught fire',
      'flames', 'sparks', 'spark', 'smoke', 'smoking',
      'water near electricity', 'water near electrical', 'flooding near electricity',
      'water on the outlet', 'water in the socket', 'wet outlet', 'wet socket',
      'electric shock', 'got shocked', 'someone collapsed', 'unconscious',
      "can't breathe", 'cannot breathe', 'chest pain', 'severe burn',
      'गैस की गंध', 'गैस की बदबू', 'गैस लीक', 'सिलेंडर लीक',
      'जलने की गंध', 'जलने की बदबू', 'आग लग', 'आग लगी', 'लपटें',
      'चिंगारी', 'चिंगारियां', 'धुआँ', 'धुआं',
      'बिजली के पास पानी', 'बिजली के पास बाढ़', 'पानी और बिजली', 'सॉकेट में पानी',
      'बेहोश', 'सांस नहीं', 'बिजली का करंट लगा',
    ],
  },
  {
    level: 'professional',
    phrases: [
      'exposed wiring', 'exposed wire', 'live wire', 'bare wire', 'bare wiring',
      'main electrical panel', 'breaker panel wiring', 'rewire the house',
      'mains wiring', '240v', '240 volt', 'high voltage',
      'gas line', 'gas pipe', 'gas connection', 'gas regulator', 'gas valve',
      'load bearing wall', 'load-bearing wall', 'remove a wall', 'knock down the wall',
      'ceiling collapse', 'roof collapse', 'foundation crack', 'cracked beam',
      'mix bleach and ammonia', 'bleach and ammonia', 'refrigerant', 'freon',
      'asbestos', 'lead paint',
      'bypass the safety', 'bypass safety', 'disable the breaker', 'defeat the interlock',
      'remove the ground', 'remove earthing', 'ungrounded on purpose',
      'खुली तार', 'नंगी तार', 'करंट आ रहा', 'बिजली का झटका',
      'गैस पाइप', 'गैस लाइन', 'गैस कनेक्शन',
      'दीवार गिरा', 'छत गिर', 'बीम में दरार',
      'ब्लीच और अमोनिया', 'एस्बेस्टस', 'सुरक्षा हटा', 'अर्थिंग हटा',
    ],
  },
]

const SAFETY_LEVEL_RANK: Record<SafetyLevel, number> = {
  caution: 1,
  professional: 2,
  emergency: 3,
}

function safetyMatches(haystack: string, phrase: string): boolean {
  const idx = haystack.indexOf(phrase)
  if (idx === -1) return false
  // ASCII phrases get word-boundary checks; Devanagari phrases do not.
  if (!/^[\x20-\x7e]+$/.test(phrase)) return true
  const before = haystack[idx - 1]
  const after = haystack[idx + phrase.length]
  const isWord = (ch: string | undefined) => ch !== undefined && /[a-z0-9]/.test(ch)
  return !isWord(before) && !isWord(after)
}

/** Highest safety level found in the text, or null when nothing is flagged. */
export function screenSafety(input: string): SafetyLevel | null {
  if (typeof input !== 'string' || input.trim() === '') return null
  const haystack = input.normalize('NFC').toLowerCase()
  let highest: SafetyLevel | null = null
  for (const rule of SAFETY_RULES) {
    if (rule.phrases.some((p) => safetyMatches(haystack, p))) {
      if (highest === null || SAFETY_LEVEL_RANK[rule.level] > SAFETY_LEVEL_RANK[highest]) {
        highest = rule.level
      }
    }
  }
  return highest
}

/**
 * Applies the safety gate to a validated diagnosis using the user's description
 * plus the model's own output. The gate can only ESCALATE: it never lowers
 * severity, never clears safetyStop, and never rewrites the diagnosis text.
 *   - any 'professional' or 'emergency' hit  -> severity 'high' + safetyStop
 *   - 'emergency' additionally forces safetyStop regardless of prior severity
 */
export function applySafetyGate(
  diagnosis: DiagnosisPayload,
  description: string,
): DiagnosisPayload {
  const inputLevel = screenSafety(description)
  const outputLevel = screenSafety(
    [diagnosis.issueName, diagnosis.summary, diagnosis.recommendedFix, diagnosis.safetyWarning]
      .join('\n'),
  )
  const levels = [inputLevel, outputLevel].filter((l): l is SafetyLevel => l !== null)
  if (levels.length === 0) return diagnosis

  const highest = levels.reduce((a, b) => (SAFETY_LEVEL_RANK[b] > SAFETY_LEVEL_RANK[a] ? b : a))
  const mustBlock = SAFETY_LEVEL_RANK[highest] >= SAFETY_LEVEL_RANK.professional
  if (!mustBlock && !diagnosis.safetyStop) return diagnosis

  return {
    ...diagnosis,
    severity: 'high',
    safetyStop: true,
  }
}
