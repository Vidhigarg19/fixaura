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
  // Ordered, issue-specific repair steps for low/medium severity results only.
  // Validated by parseGuideSteps; omitted when severity is 'high' or malformed.
  guideSteps?: GuideStepPayload[]
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

  // A blocked ('high') result never carries steps. A bad guide is dropped, not fatal.
  const guideSteps = severity === 'high' ? [] : parseGuideSteps(r.guideSteps)

  return {
    ...(guideSteps.length ? { guideSteps } : {}),
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

// ---------- S05 additions: server-side safety gate (context-aware) ----------
//
// Pure moderation screening. This MIRRORS the client policy in src/lib/safety.ts.
// Deno Edge Functions cannot import from the Vite `src/` tree, so the rule source
// is duplicated here deliberately; keep the two in sync and bump
// SAFETY_POLICY_VERSION in both when the rules change.
//
// Calibration: only genuine, life-threatening hazards reach 'professional' /
// 'emergency' (the levels that BLOCK). Routine repair vocabulary is only
// 'caution', which never blocks. A phrase counts only when ASSERTED: a precaution
// such as "if you see sparks, stop" or "do not touch exposed wires" is ignored.
// The gate screens what the USER reported and what the model OBSERVED, never the
// model's boilerplate safetyWarning or tool list.

export const SAFETY_POLICY_VERSION = 's05.2'

export type SafetyLevel = 'caution' | 'professional' | 'emergency'

interface SafetyRule {
  level: SafetyLevel
  phrases: string[]
}

const SAFETY_RULES: SafetyRule[] = [
  {
    level: 'emergency',
    phrases: [
      'gas smell', 'smell of gas', 'smell gas', 'smelling gas', 'smells like gas', 'smells of gas',
      'gas leak', 'leaking gas', 'lpg leak', 'cylinder leak', 'gas cylinder leak',
      'burning smell', 'smells burnt', 'smells burning', 'smell burning', 'smell of burning',
      'burning plastic', 'burnt plastic', 'on fire', 'caught fire', 'catching fire', 'flames coming',
      'sparking', 'sparks flying', 'sparks coming', 'throwing sparks', 'shooting sparks', 'arcing',
      'smoke coming', 'smoke from', 'smoke is', 'smoke pouring', 'smoke out', 'see smoke',
      'saw smoke', 'seeing smoke', 'there is smoke', 'there was smoke', 'smoking from',
      'water near electricity', 'water near electrical', 'flooding near electricity',
      'water on the outlet', 'water in the socket', 'water is in the socket', 'water inside the socket',
      'water in the outlet', 'water is in the outlet', 'water inside the outlet', 'wet outlet', 'wet socket',
      'electric shock', 'got shocked', 'shocked me', 'someone collapsed', 'unconscious',
      "can't breathe", 'cannot breathe', 'chest pain', 'severe burn',
      'गैस की गंध', 'गैस की बदबू', 'गैस लीक', 'सिलेंडर लीक',
      'जलने की गंध', 'जलने की बदबू', 'आग लग', 'आग लगी', 'लपटें',
      'चिंगारी निकल', 'चिंगारियां निकल', 'धुआँ निकल', 'धुआं निकल', 'धुआँ आ', 'धुआं आ',
      'बिजली के पास पानी', 'बिजली के पास बाढ़', 'पानी और बिजली', 'सॉकेट में पानी',
      'बेहोश', 'सांस नहीं', 'बिजली का करंट लगा',
    ],
  },
  {
    level: 'professional',
    phrases: [
      'exposed live', 'live wire', 'live wires', 'bare wire', 'bare wires', 'bare wiring',
      'exposed wire', 'exposed wires', 'exposed wiring',
      'scorch marks', 'scorched outlet', 'scorched socket', 'melted plug', 'melted socket',
      'melted outlet', 'main electrical panel', 'breaker panel wiring', 'service panel',
      'rewire the house', 'mains wiring',
      'repair the gas', 'replace the gas line', 'replace the gas pipe', 'modify the gas',
      'gas line repair', 'gas pipe repair', 'install a gas',
      'load bearing wall', 'load-bearing wall', 'remove a wall', 'knock down the wall',
      'ceiling collapse', 'roof collapse', 'foundation crack', 'cracked beam',
      'water main burst', 'burst water main', 'water main break', 'main pipe burst',
      'mix bleach and ammonia', 'bleach and ammonia', 'asbestos', 'lead paint',
      'bypass the safety', 'bypass safety', 'disable the breaker', 'defeat the interlock',
      'remove the ground', 'remove earthing', 'ungrounded on purpose',
      'खुली तार', 'नंगी तार', 'करंट आ रहा', 'बिजली का झटका',
      'गैस पाइप बदल', 'दीवार गिरा', 'छत गिर', 'बीम में दरार',
      'ब्लीच और अमोनिया', 'एस्बेस्टस', 'सुरक्षा हटा', 'अर्थिंग हटा',
    ],
  },
  {
    level: 'caution',
    phrases: [
      '240v', '240 volt', 'high voltage', 'capacitor', 'magnetron',
      'gas line', 'gas pipe', 'gas connection', 'gas regulator', 'gas valve',
      'refrigerant', 'freon',
    ],
  },
]

const SAFETY_LEVEL_RANK: Record<SafetyLevel, number> = {
  caution: 1,
  professional: 2,
  emergency: 3,
}

const PRECAUTION_RE =
  /\b(?:if|in case|should|whenever|unless|never|no|not|without|avoid|avoiding|prevent|preventing|protect|reduce|risk|danger of|check for|check that|checking for|watch for|watch out|look for|look out for|looking for|be alert|signs? of|free of|free from|ensure|make sure)\b|n't\b/
const HINDI_PRECAUTION = ['अगर', 'यदि', 'कभी न']
const IGNITER_RE = /\b(?:ignit\w*|lighter|spark plug|candle)\b/
const CLAUSE_DELIMITER = /[.!?\n;]/

function clauseBounds(text: string, index: number): { start: number; end: number } {
  let start = index
  while (start > 0 && !CLAUSE_DELIMITER.test(text[start - 1])) start -= 1
  let end = index
  while (end < text.length && !CLAUSE_DELIMITER.test(text[end])) end += 1
  return { start, end }
}

function isPrecautionary(prefix: string): boolean {
  const segment = prefix.split(/\b(?:and|but|however|then|because|so)\b|[,:()]/).pop() ?? ''
  const tail = segment.slice(-60)
  return PRECAUTION_RE.test(tail) || HINDI_PRECAUTION.some((marker) => tail.includes(marker))
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[a-z0-9]/.test(ch)
}

function phraseIsActive(haystack: string, phrase: string): boolean {
  const ascii = /^[\x20-\x7e]+$/.test(phrase)
  let from = 0
  for (;;) {
    const index = haystack.indexOf(phrase, from)
    if (index === -1) return false
    from = index + phrase.length

    if (ascii && (isWordChar(haystack[index - 1]) || isWordChar(haystack[index + phrase.length]))) {
      continue
    }
    const { start, end } = clauseBounds(haystack, index)
    if (isPrecautionary(haystack.slice(start, index))) continue
    if (phrase.includes('spark') && IGNITER_RE.test(haystack.slice(start, end))) continue
    return true
  }
}

/** Highest safety level ASSERTED in the text, or null when nothing is flagged. */
export function screenSafety(input: string): SafetyLevel | null {
  if (typeof input !== 'string' || input.trim() === '') return null
  const haystack = input.normalize('NFC').toLowerCase().replace(/[\u2018\u2019]/g, "'")
  let highest: SafetyLevel | null = null
  for (const rule of SAFETY_RULES) {
    if (rule.phrases.some((phrase) => phraseIsActive(haystack, phrase))) {
      if (highest === null || SAFETY_LEVEL_RANK[rule.level] > SAFETY_LEVEL_RANK[highest]) {
        highest = rule.level
      }
    }
  }
  return highest
}

/**
 * Applies the safety gate to a validated diagnosis. It screens the user's own
 * description plus what the model OBSERVED (issue, summary, fix, step text). It
 * does NOT screen the model's generic safetyWarning, step safety notes or tools.
 * The gate can only ESCALATE and never lowers severity or rewrites text:
 *   - a 'professional' or 'emergency' finding -> severity 'high' + safetyStop,
 *     and any generated guide steps are removed (a blocked result has no steps).
 *   - 'caution' findings never block.
 */
export function applySafetyGate(
  diagnosis: DiagnosisPayload,
  description: string,
): DiagnosisPayload {
  const inputLevel = screenSafety(description)
  const outputLevel = screenSafety(
    [
      diagnosis.issueName,
      diagnosis.summary,
      diagnosis.recommendedFix,
      ...(diagnosis.guideSteps ?? []).map((step) => `${step.title}. ${step.instruction}`),
    ].join('\n'),
  )
  const levels = [inputLevel, outputLevel].filter((l): l is SafetyLevel => l !== null)
  const highest = levels.length
    ? levels.reduce((a, b) => (SAFETY_LEVEL_RANK[b] > SAFETY_LEVEL_RANK[a] ? b : a))
    : null
  const mustBlock = highest !== null && SAFETY_LEVEL_RANK[highest] >= SAFETY_LEVEL_RANK.professional
  if (!mustBlock && !diagnosis.safetyStop) return diagnosis

  const blocked: DiagnosisPayload = { ...diagnosis, severity: 'high', safetyStop: true }
  delete blocked.guideSteps
  return blocked
}

// ---------- Guide steps (model-authored, validated, never trusted blindly) ----------

export interface GuideStepPayload {
  id: string
  title: string
  instruction: string
  safetyNote: string
  requiresConfirmation: boolean
  visualCue: 'arrow' | 'box' | 'circle' | 'line'
  estimatedSeconds: number
}

const MIN_GUIDE_STEPS = 3
const MAX_GUIDE_STEPS = 10
const VISUAL_CUES: ReadonlyArray<GuideStepPayload['visualCue']> = ['arrow', 'box', 'circle', 'line']

/**
 * Defensive parse of the model's optional `guideSteps`. Malformed entries are
 * skipped; fewer than MIN_GUIDE_STEPS valid steps means NO guide (an empty array),
 * so a half-formed guide is never shown. Step ids are assigned here, not trusted.
 */
export function parseGuideSteps(raw: unknown): GuideStepPayload[] {
  if (!Array.isArray(raw)) return []
  const steps: GuideStepPayload[] = []
  for (const item of raw) {
    if (steps.length >= MAX_GUIDE_STEPS) break
    const record = asRecord(item)
    if (!record) continue
    const title = typeof record.title === 'string' ? record.title.trim().slice(0, 80) : ''
    const instruction = typeof record.instruction === 'string' ? record.instruction.trim().slice(0, 500) : ''
    if (!title || !instruction) continue
    const safetyNote = typeof record.safetyNote === 'string' ? record.safetyNote.trim().slice(0, 240) : ''
    const seconds =
      typeof record.estimatedSeconds === 'number' && Number.isFinite(record.estimatedSeconds)
        ? Math.round(Math.min(3600, Math.max(10, record.estimatedSeconds)))
        : 120
    const cue = VISUAL_CUES.find((value) => value === record.visualCue) ?? 'circle'
    steps.push({
      id: `step-${steps.length + 1}`,
      title,
      instruction,
      safetyNote,
      requiresConfirmation: record.requiresConfirmation === true,
      visualCue: cue,
      estimatedSeconds: seconds,
    })
  }
  return steps.length >= MIN_GUIDE_STEPS ? steps : []
}
