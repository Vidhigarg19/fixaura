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
    const exhausted = /per day|daily|billing|plan|quota exceeded|monthly/.test(message)
    if (exhausted) return makeError('quota_exceeded', false)
    if (
      status === 429 ||
      retryDelay !== undefined ||
      /per minute|rate limit|requests per/.test(message)
    ) {
      return makeError('rate_limited', true, retryDelay)
    }
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

export const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4
export const MAX_DESCRIPTION_CHARS = 500

export interface ImageInput {
  imageBase64: string
  mediaType: (typeof ALLOWED_MEDIA_TYPES)[number]
}

export interface DiagnoseRequest extends ImageInput {
  description: string
}

export interface VerifyRequest {
  mode: 'verify'
  afterImage: ImageInput
  beforeImage?: ImageInput
  issueName: string
  description: string
  stepsSummary: string
  note?: string
  locale: string
}

function isValidImage(value: unknown): value is ImageInput {
  const image = asRecord(value)
  if (
    !image ||
    typeof image.imageBase64 !== 'string' ||
    image.imageBase64.length === 0 ||
    image.imageBase64.length > MAX_BASE64_CHARS ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.imageBase64) ||
    typeof image.mediaType !== 'string' ||
    !ALLOWED_MEDIA_TYPES.includes(image.mediaType)
  ) {
    return false
  }
  const padding = image.imageBase64.endsWith('==') ? 2 : image.imageBase64.endsWith('=') ? 1 : 0
  const byteLength = (image.imageBase64.length / 4) * 3 - padding
  if (byteLength === 0 || byteLength > MAX_IMAGE_BYTES) return false
  const bytes = Uint8Array.from(atob(image.imageBase64), (character) => character.charCodeAt(0))
  if (image.mediaType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (image.mediaType === 'image/png') {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    )
  }
  return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum
}

export function validateDiagnosisRequest(body: unknown): DiagnoseRequest | null {
  const r = asRecord(body)
  if (!r) return null
  const image = { imageBase64: r.imageBase64, mediaType: r.mediaType }
  if (!isValidImage(image) || !boundedText(r.description, MAX_DESCRIPTION_CHARS)) return null
  return { ...image, description: r.description.trim() }
}

export function validateVerificationRequest(body: unknown): VerifyRequest | null {
  const r = asRecord(body)
  if (!r || r.mode !== 'verify' || !isValidImage(r.afterImage)) return null
  if (
    r.beforeImage !== undefined &&
    r.beforeImage !== null &&
    !isValidImage(r.beforeImage)
  ) {
    return null
  }
  if (
    !boundedText(r.issueName, 200) ||
    typeof r.description !== 'string' ||
    r.description.length > MAX_DESCRIPTION_CHARS ||
    typeof r.stepsSummary !== 'string' ||
    r.stepsSummary.length > 3000 ||
    typeof r.locale !== 'string' ||
    r.locale.length > 20 ||
    (r.note !== undefined && (typeof r.note !== 'string' || r.note.length > 200))
  ) {
    return null
  }
  return {
    mode: 'verify',
    afterImage: r.afterImage,
    ...(r.beforeImage ? { beforeImage: r.beforeImage as ImageInput } : {}),
    issueName: r.issueName.trim(),
    description: r.description.trim(),
    stepsSummary: r.stepsSummary,
    ...(typeof r.note === 'string' && r.note.trim() ? { note: r.note.trim() } : {}),
    locale: r.locale,
  }
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
  safetyStop?: boolean
}

export function parseModelJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  return parseJson(text.slice(start, end + 1))
}

const HAZARD_PATTERN =
  /\b(gas leaks?|leaking gas|gas odors?|gas smells?|smell(?:s|ed|ing)? (?:like |of )?gas|rotten[- ]egg (?:smell|odor)|exposed (?:live )?(?:electrical )?wires?|live wires?|wires? (?:are )?live|electrical sparks?|electrical sparking|sparking (?:outlet|wire|electrical)|sparks? (?:from|at|in) (?:the )?(?:outlet|wire|breaker)|(?:outlet|wire|breaker) sparks?|outlet sparking|burning (?:smell|odor)|smell of burning|smoke|fire|carbon monoxide|co alarm|structural collapse|chemical fumes?)\b/i

export function containsDanger(text: string): boolean {
  return HAZARD_PATTERN.test(text)
}

export function safetyStopDiagnosis(
  issueName = 'Potential household safety hazard',
  hazardContext = issueName
): DiagnosisPayload {
  const hazard = hazardContext.toLowerCase()
  const nextStepAdvice = /gas|rotten[- ]egg/.test(hazard)
    ? 'Leave the home immediately. Do not use switches, flames, or appliances. From a safe location, call your gas utility or emergency services.'
    : /smoke|fire|burning/.test(hazard)
      ? 'Evacuate and move to a safe location. Call emergency services; do not re-enter or attempt to handle the fire.'
      : /electr|wire|spark/.test(hazard)
        ? 'Stay away and do not touch the wires or equipment. Keep others clear and contact emergency services or a licensed electrician from a safe location.'
        : 'Move away from the hazard. If there is immediate danger, evacuate and contact emergency services from a safe location. Otherwise, contact a qualified professional.'
  return {
    issueName,
    confidence: 95,
    summary: 'A potentially dangerous household condition was reported or detected. Do not attempt a DIY repair.',
    severity: 'high',
    recommendedFix: 'Do not attempt a DIY repair. Contact a qualified professional.',
    recommendedTools: [],
    nextStepAdvice,
    safetyWarning: nextStepAdvice,
    explanation: 'DIY repair guidance is blocked because this condition may cause serious harm.',
    safetyStop: true,
  }
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
  if (
    typeof r.confidence !== 'number' ||
    !Number.isFinite(r.confidence) ||
    r.confidence < 0 ||
    r.confidence > 100 ||
    (r.safetyStop !== undefined && typeof r.safetyStop !== 'boolean')
  ) return null
  if (!Array.isArray(r.recommendedTools) || !r.recommendedTools.every((t) => typeof t === 'string')) return null

  const safetyContext = [
    issueName,
    summary,
    recommendedFix,
    nextStepAdvice,
    safetyWarning,
    explanation,
    ...r.recommendedTools,
  ].join(' ')
  const safetyStop =
    r.safetyStop === true ||
    severity === 'high' ||
    containsDanger(safetyContext)

  if (safetyStop) {
    const safeDiagnosis = safetyStopDiagnosis(issueName, safetyContext)
    safeDiagnosis.confidence = Math.round(Math.min(100, Math.max(0, r.confidence)))
    return safeDiagnosis
  }

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
    safetyStop: false,
  }
}

export interface VerificationPayload {
  status: 'resolved' | 'monitor' | 'unresolved' | 'professional'
  summary: string
  checks: Array<{ label: string; passed: boolean }>
  nextAdvice: string
}

export function validateVerification(raw: unknown): VerificationPayload | null {
  const r = asRecord(raw)
  if (!r) return null
  const statuses = ['resolved', 'monitor', 'unresolved', 'professional']
  if (
    typeof r.status !== 'string' ||
    !statuses.includes(r.status) ||
    !boundedText(r.summary, 2000) ||
    !boundedText(r.nextAdvice, 2000) ||
    !Array.isArray(r.checks) ||
    r.checks.length === 0 ||
    r.checks.length > 20
  ) {
    return null
  }
  const checks: Array<{ label: string; passed: boolean }> = []
  for (const value of r.checks) {
    const check = asRecord(value)
    if (!check || !boundedText(check.label, 500) || typeof check.passed !== 'boolean') return null
    checks.push({ label: check.label.trim(), passed: check.passed })
  }
  const safetyStop =
    r.status === 'professional' ||
    containsDanger([r.summary, r.nextAdvice, ...checks.map((check) => check.label)].join(' '))
  if (safetyStop) {
    return {
      status: 'professional',
      summary: 'A potential safety hazard was identified. Verification cannot confirm a safe repair.',
      checks: [{ label: 'Stop work and arrange professional inspection.', passed: false }],
      nextAdvice: 'Move away from the hazard. Contact emergency services if there is immediate danger, otherwise contact a qualified professional.',
    }
  }
  if (r.status === 'resolved' && checks.some((check) => !check.passed)) return null
  return {
    status: r.status as VerificationPayload['status'],
    summary: r.summary.trim(),
    checks,
    nextAdvice: r.nextAdvice.trim(),
  }
}
