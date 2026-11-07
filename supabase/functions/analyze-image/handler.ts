import {
  HTTP_STATUS,
  containsDanger,
  makeError,
  mapProviderFailure,
  parseModelJson,
  safetyStopDiagnosis,
  validateDiagnosis,
  validateDiagnosisRequest,
  validateVerification,
  validateVerificationRequest,
  type ApiError,
} from './logic.ts'

export interface HandlerDeps {
  apiKey: string | undefined
  model: string
  supabaseUrl: string | undefined
  supabaseKey: string | undefined
  fetchFn: typeof fetch
  timeoutMs: number
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

function diagnosisPrompt(description: string) {
  return `You are HomeGenie, a household repair vision assistant. Analyze the image with the user's problem description. Do not invent details that are not visible; if the image is unclear, say so and lower confidence. Return only JSON matching the requested schema.

SAFETY: Gas leaks or gas odors, exposed/live electrical wires, electrical sparks, burning smells, smoke, fire, carbon monoxide, structural danger, or any other potentially dangerous condition require a Safety Stop. Do not give DIY steps or recommend tools. Return severity "high", professional/emergency advice only, and an empty recommendedTools array.

User's problem description: ${description}`
}

function verificationPrompt(input: {
  issueName: string
  description: string
  stepsSummary: string
  note?: string
}) {
  return `You are HomeGenie, a cautious household repair verification assistant. Compare the before and after images where both are supplied. Do not claim a check passed unless it is visibly supported. If evidence is uncertain, use status "monitor" or "unresolved", not "resolved". Return only JSON matching the requested schema.

SAFETY: If either image or the supplied information suggests gas leaks/odors, exposed/live electrical wires, sparks, burning smells, smoke, fire, carbon monoxide, structural danger, or any other dangerous condition, use status "professional"; do not say the repair is resolved and mark all checks as failed.

Issue: ${input.issueName}
Problem: ${input.description}
Repair steps: ${input.stepsSummary}
User note: ${input.note ?? 'None'}`
}

const diagnosisSchema = {
  type: 'OBJECT',
  properties: {
    issueName: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
    summary: { type: 'STRING' },
    severity: { type: 'STRING', enum: ['low', 'medium', 'high'] },
    recommendedFix: { type: 'STRING' },
    recommendedTools: { type: 'ARRAY', items: { type: 'STRING' } },
    nextStepAdvice: { type: 'STRING' },
    safetyWarning: { type: 'STRING' },
    explanation: { type: 'STRING' },
    safetyStop: { type: 'BOOLEAN' },
  },
  required: [
    'issueName',
    'confidence',
    'summary',
    'severity',
    'recommendedFix',
    'recommendedTools',
    'nextStepAdvice',
    'safetyWarning',
    'explanation',
  ],
}

const verificationSchema = {
  type: 'OBJECT',
  properties: {
    status: { type: 'STRING', enum: ['resolved', 'monitor', 'unresolved', 'professional'] },
    summary: { type: 'STRING' },
    checks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          passed: { type: 'BOOLEAN' },
        },
        required: ['label', 'passed'],
      },
    },
    nextAdvice: { type: 'STRING' },
  },
  required: ['status', 'summary', 'checks', 'nextAdvice'],
}

function bearerToken(request: Request): string | null {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null
}

async function authenticate(request: Request, deps: HandlerDeps): Promise<ApiError | null> {
  const token = bearerToken(request)
  if (!token) return makeError('unauthenticated', false)
  if (!deps.supabaseUrl || !deps.supabaseKey) {
    return makeError('configuration_error', false)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs)
  try {
    const response = await deps.fetchFn(
      `${deps.supabaseUrl.replace(/\/$/, '')}/auth/v1/user`,
      {
        signal: controller.signal,
        headers: {
          apikey: deps.supabaseKey,
          Authorization: `Bearer ${token}`,
        },
      }
    )
    if (response.ok) return null
    if (response.status === 401 || response.status === 403) {
      return makeError('unauthenticated', false)
    }
    console.error('analyze-image: auth verification failed', response.status)
    return makeError('service_unavailable', true)
  } catch {
    console.error(
      'analyze-image: auth verification request failed',
      controller.signal.aborted ? 'timeout' : 'network_error'
    )
    return makeError('service_unavailable', true)
  } finally {
    clearTimeout(timer)
  }
}

function candidateText(providerJson: unknown): string {
  if (!providerJson || typeof providerJson !== 'object') return ''
  const candidate = (providerJson as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>
  }).candidates?.[0]
  return candidate?.content?.parts
    ?.map((part) => typeof part.text === 'string' ? part.text : '')
    .join('') ?? ''
}

function hasProviderSafetyBlock(providerJson: unknown): boolean {
  if (!providerJson || typeof providerJson !== 'object') return false
  const result = providerJson as {
    promptFeedback?: { blockReason?: unknown }
    candidates?: Array<{ finishReason?: unknown }>
  }
  return typeof result.promptFeedback?.blockReason === 'string' ||
    result.candidates?.[0]?.finishReason === 'SAFETY'
}

export async function handleAnalyze(request: Request, deps: HandlerDeps): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return fail(makeError('invalid_input', false), 405)

  const authError = await authenticate(request, deps)
  if (authError) return fail(authError)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail(makeError('invalid_input', false))
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(makeError('invalid_input', false))
  }

  const mode = (body as Record<string, unknown>).mode
  const verificationInput = mode === 'verify' ? validateVerificationRequest(body) : null
  const diagnosisInput = mode === undefined ? validateDiagnosisRequest(body) : null
  if (!verificationInput && !diagnosisInput) return fail(makeError('invalid_input', false))

  if (diagnosisInput && containsDanger(diagnosisInput.description)) {
    return respond(200, {
      ok: true,
      data: safetyStopDiagnosis(undefined, diagnosisInput.description),
    })
  }
  if (
    verificationInput &&
    containsDanger([
      verificationInput.issueName,
      verificationInput.description,
      verificationInput.stepsSummary,
      verificationInput.note ?? '',
    ].join(' '))
  ) {
    return respond(200, {
      ok: true,
      data: {
        status: 'professional',
        summary: 'A potential safety hazard was reported. Verification cannot confirm a safe repair.',
        checks: [{ label: 'Stop work and arrange professional inspection.', passed: false }],
        nextAdvice: 'Move away from the hazard. Contact emergency services if there is immediate danger, otherwise contact a qualified professional.',
      },
    })
  }
  if (!deps.apiKey) {
    console.error('analyze-image: GEMINI_API_KEY is not configured')
    return fail(makeError('configuration_error', false))
  }

  const requestInput = diagnosisInput ?? verificationInput
  if (!requestInput) return fail(makeError('invalid_input', false))
  const isDiagnosis = 'mediaType' in requestInput
  const images = isDiagnosis
    ? [{ imageBase64: requestInput.imageBase64, mediaType: requestInput.mediaType }]
    : [
        ...(requestInput.beforeImage ? [requestInput.beforeImage] : []),
        requestInput.afterImage,
      ]
  const prompt = isDiagnosis
    ? diagnosisPrompt(requestInput.description)
    : verificationPrompt(requestInput)
  const schema = isDiagnosis ? diagnosisSchema : verificationSchema
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs)
  try {
    const response = await deps.fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${deps.model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': deps.apiKey },
        body: JSON.stringify({
          contents: [{
            parts: [
              ...images.map((image) => ({
                inline_data: { mime_type: image.mediaType, data: image.imageBase64 },
              })),
              { text: prompt },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.2,
            maxOutputTokens: 2048,
          },
        }),
        signal: controller.signal,
      }
    )
    if (!response.ok) {
      let responseText = ''
      try {
        responseText = await response.text()
      } catch {
        // Status alone still maps to a safe client error.
      }
      const apiError = mapProviderFailure(
        response.status,
        responseText,
        response.headers.get('retry-after')
      )
      console.error('analyze-image: Gemini provider error', response.status, apiError.code)
      return fail(apiError)
    }

    let providerJson: unknown
    try {
      providerJson = await response.json()
    } catch {
      return fail(makeError('invalid_response', true))
    }
    if (hasProviderSafetyBlock(providerJson)) {
      if (isDiagnosis) {
        return respond(200, {
          ok: true,
          data: safetyStopDiagnosis(undefined, requestInput.description),
        })
      }
      return respond(200, {
        ok: true,
        data: {
          status: 'professional',
          summary: 'A potential safety hazard was detected. Verification cannot confirm a safe repair.',
          checks: [{ label: 'Stop work and arrange professional inspection.', passed: false }],
          nextAdvice: 'Move away from the hazard. Contact emergency services if there is immediate danger, otherwise contact a qualified professional.',
        },
      })
    }

    const text = candidateText(providerJson)
    const parsed = parseModelJson(text)
    if (isDiagnosis) {
      const diagnosis = validateDiagnosis(parsed)
      if (!diagnosis) {
        console.error('analyze-image: Gemini diagnosis response failed validation')
        return fail(makeError('invalid_response', true))
      }
      return respond(200, { ok: true, data: diagnosis })
    }

    if (
      verificationInput &&
      containsDanger([
        verificationInput.issueName,
        verificationInput.description,
        verificationInput.stepsSummary,
        verificationInput.note ?? '',
      ].join(' '))
    ) {
      return respond(200, {
        ok: true,
        data: {
          status: 'professional',
          summary: 'A potential safety hazard was reported or detected. Verification cannot confirm a safe repair.',
          checks: [{ label: 'Stop work and arrange professional inspection.', passed: false }],
          nextAdvice: 'Move away from the hazard. Contact emergency services if there is immediate danger, otherwise contact a qualified professional.',
        },
      })
    }

    const verification = validateVerification(parsed)
    if (!verification) {
      console.error('analyze-image: Gemini verification response failed validation')
      return fail(makeError('invalid_response', true))
    }
    return respond(200, { ok: true, data: verification })
  } catch {
    const timedOut = controller.signal.aborted
    console.error('analyze-image: Gemini request failed', timedOut ? 'timeout' : 'network_error')
    return fail(makeError('service_unavailable', true), timedOut ? 504 : 503)
  } finally {
    clearTimeout(timer)
  }
}
