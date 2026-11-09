import {
  applySafetyGate,
  ConfigurationError,
  HTTP_STATUS,
  makeError,
  mapProviderFailure,
  parseModelJson,
  providerErrorSummary,
  secondsUntilNextMinute,
  validateDiagnosis,
  validateRequest,
  type ApiError,
  type QuotaLimits,
  type QuotaResult,
} from './logic.ts'

export interface HandlerDeps {
  apiKey: string | undefined
  model: string
  fetchFn: typeof fetch
  timeoutMs: number
  // Server verified user id (JWT se). Request body ke user_id par kabhi bharosa nahi.
  identifyUser: (request: Request) => Promise<string | null>
  // Atomic quota check + consume. Store fail ho to throw (hum fail-closed rehte hain).
  consumeQuota: (userId: string, limits: QuotaLimits) => Promise<QuotaResult>
  limits: QuotaLimits
  now: () => Date
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function respond(status: number, payload: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extra },
  })
}

function fail(error: ApiError, status = HTTP_STATUS[error.code]) {
  const extra: Record<string, string> =
    error.retryAfterSeconds !== undefined ? { 'Retry-After': String(error.retryAfterSeconds) } : {}
  return respond(status, { ok: false, error }, extra)
}

function buildPrompt(description: string) {
  return `You are HomeGenie, a household repair vision assistant. Analyze the image together with the user's problem description. Do not invent details that are not visible; if the image is unclear, say so in the summary and lower the confidence.

Severity rubric. Be accurate, not cautious by default:
- "low": a routine, safe do-it-yourself fix, such as cleaning a filter, tightening a loose screw or hinge, replacing a battery or bulb, resetting a tripped breaker or appliance, unclogging a drain, or a minor adjustment.
- "medium": a do-it-yourself fix that needs care or basic tools, such as replacing a small part on an unplugged appliance, or re-sealing a minor leak after shutting off the water.
- "high": ONLY for a genuine, immediate danger to life or property: exposed or live wires, sparking or arcing, an active gas leak or gas smell, fire, smoke or a burning smell, water in contact with electrics, a burst water main or structural failure, or the user states such a danger. Do NOT use "high" just because the appliance is electrical, has a plug, is old, or because a professional could also do the job.
General precautions (for example "unplug the appliance first") belong in safetyWarning and must not raise the severity on their own.

When severity is "low" or "medium", also provide "guideSteps": 3 to 8 ordered, concrete, specific steps for THIS issue (not generic filler). The first step must make the work safe (switch off and unplug, or shut off the water supply, when relevant). Each step needs a short title, a clear instruction, and a safetyNote. Set requiresConfirmation to true only for steps where a mistake could cause injury. When severity is "high", return "guideSteps": [].

User's description of the problem: ${description}. Respond with ONLY valid JSON (no markdown) using this schema:
{
  "issueName": string,
  "confidence": number 0-100,
  "summary": string,
  "severity": "low" | "medium" | "high",
  "recommendedFix": string,
  "recommendedTools": string[],
  "nextStepAdvice": string,
  "safetyWarning": string,
  "explanation": string,
  "guideSteps": [{ "title": string, "instruction": string, "safetyNote": string, "requiresConfirmation": boolean }]
}`
}

export async function handleAnalyze(request: Request, deps: HandlerDeps): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const started = Date.now()
  const requestId = crypto.randomUUID().slice(0, 8)
  // Structured, sanitized log: image, description, key, poora user id kabhi nahi.
  const log = (status: number, fields: Record<string, unknown>, userRef?: string) => {
    const line = JSON.stringify({
      event: 'analyze-image',
      requestId,
      status,
      latencyMs: Date.now() - started,
      model: deps.model,
      user: userRef,
      ...fields,
    })
    if (status >= 400) console.error(line)
    else console.log(line)
  }
  const reject = (
    error: ApiError,
    status = HTTP_STATUS[error.code],
    fields: Record<string, unknown> = {},
    userRef?: string,
  ) => {
    log(status, { outcome: error.code, ...fields }, userRef)
    return fail(error, status)
  }

  if (request.method !== 'POST') return reject(makeError('invalid_input', false), 405, { reason: 'method' })

  if (!deps.apiKey) return reject(makeError('configuration_error', false), undefined, { reason: 'missing GEMINI_API_KEY' })

  // 1) Login check
  let userId: string | null
  try {
    userId = await deps.identifyUser(request)
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return reject(makeError('configuration_error', false), undefined, { reason: error.message })
    }
    return reject(makeError('service_unavailable', true), undefined, { reason: 'auth check failed' })
  }
  if (!userId) return reject(makeError('unauthenticated', false), undefined, { reason: 'no valid session' })
  const userRef = userId.slice(0, 8)
  const rejectAuthenticated = (
    error: ApiError,
    status = HTTP_STATUS[error.code],
    fields: Record<string, unknown> = {},
  ) => reject(error, status, fields, userRef)

  // 2) Input validation (invalid request quota consume nahi karti)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return rejectAuthenticated(makeError('invalid_input', false), undefined, { reason: 'body not json' })
  }
  const input = validateRequest(body)
  if (!input) return rejectAuthenticated(makeError('invalid_input', false), undefined, { reason: 'validation' })

  // 3) Quota (per-user per-minute, per-user daily, global daily). Fail-closed.
  let quota: QuotaResult
  try {
    quota = await deps.consumeQuota(userId, deps.limits)
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return rejectAuthenticated(makeError('configuration_error', false), undefined, { reason: error.message })
    }
    return rejectAuthenticated(makeError('service_unavailable', true), undefined, { reason: 'quota store failed' })
  }
  if (quota === 'user_minute') {
    return rejectAuthenticated(makeError('rate_limited', true, secondsUntilNextMinute(deps.now())), undefined, { quota })
  }
  if (quota !== 'ok') return rejectAuthenticated(makeError('quota_exceeded', false), undefined, { quota })

  // 4) Provider call (server-side, bounded timeout)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs)
  let response: Response
  try {
    response = await deps.fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${deps.model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': deps.apiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: input.mediaType, data: input.imageBase64 } },
                { text: buildPrompt(input.description) },
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
        }),
        signal: controller.signal,
      }
    )
  } catch {
    const timedOut = controller.signal.aborted
    return rejectAuthenticated(makeError('service_unavailable', true), timedOut ? 504 : 503, {
      reason: timedOut ? 'provider timeout' : 'provider network error',
    })
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const apiError = mapProviderFailure(response.status, text, response.headers.get('retry-after'))
    return rejectAuthenticated(apiError, undefined, { providerHttpStatus: response.status, ...providerErrorSummary(text) })
  }

  let providerJson: unknown
  try {
    providerJson = await response.json()
  } catch {
    return rejectAuthenticated(makeError('invalid_response', true), undefined, { reason: 'provider body not json' })
  }
  const parts = (providerJson as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  })?.candidates?.[0]?.content?.parts
  const text = parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) return rejectAuthenticated(makeError('invalid_response', false), undefined, { reason: 'empty or blocked output' })

  const diagnosis = validateDiagnosis(parseModelJson(text))
  if (!diagnosis) return rejectAuthenticated(makeError('invalid_response', true), undefined, { reason: 'output failed validation' })

  // S05 safety gate: screen the user's description and the model's own output.
  // The gate can only escalate (severity 'high' + safetyStop); it never lowers
  // risk and never rewrites the diagnosis text.
  const guarded = applySafetyGate(diagnosis, input.description)
  const safetyEscalated = guarded.safetyStop === true && diagnosis.safetyStop !== true

  log(200, { outcome: 'success', safetyEscalated }, userRef)
  return respond(200, { ok: true, data: guarded })
}
