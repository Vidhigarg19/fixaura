declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_BASE64_LENGTH = 7_000_000
const ANTHROPIC_MODEL = 'claude-sonnet-5-5'

function providerErrorMessage(status: number) {
  if (status === 401 || status === 403) {
    return 'The AI service credentials are not accepted. Please contact support.'
  }
  if (status === 429) {
    return 'The AI service is busy or has reached its usage limit. Please try again later.'
  }
  if (status === 400) {
    return 'The AI service rejected the image or request. Please try another image.'
  }
  return 'The AI service is temporarily unavailable. Please try again later.'
}

function safeProviderError(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return { type: 'unknown_error', message: 'No structured error was returned.' }
  }
  const error = (payload as {
    error?: { type?: unknown; message?: unknown }
  }).error
  const type =
    typeof error?.type === 'string' ? error.type.slice(0, 80) : 'unknown_error'
  const message =
    typeof error?.message === 'string'
      ? error.message
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[redacted]')
          .slice(0, 240)
      : 'No provider message was returned.'
  return { type, message }
}

function isValidBase64Image(value: string) {
  if (
    value.length === 0 ||
    value.length > MAX_BASE64_LENGTH ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    return false
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return (value.length / 4) * 3 - padding <= MAX_IMAGE_BYTES
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: corsHeaders })
  }

  const authorization = request.headers.get('Authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey =
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  if (!token) {
    return Response.json({ error: 'Authentication is required.' }, { status: 401, headers: corsHeaders })
  }
  if (!supabaseUrl || !supabaseKey) {
    return Response.json(
      { error: 'The authentication service is not configured.' },
      { status: 503, headers: corsHeaders }
    )
  }

  try {
    const userResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${token}`,
      },
    })
    if (!userResponse.ok) {
      return Response.json(
        { error: userResponse.status >= 500 ? 'Unable to verify your session.' : 'Your session is invalid or expired.' },
        { status: userResponse.status >= 500 ? 503 : 401, headers: corsHeaders }
      )
    }
  } catch (error) {
    console.error('Analysis authentication verification failed:', error)
    return Response.json(
      { error: 'Unable to verify your session.' },
      { status: 503, headers: corsHeaders }
    )
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return Response.json(
      { error: 'The server-side analysis key is not configured.' },
      { status: 503, headers: corsHeaders }
    )
  }

  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Invalid request body.' }, { status: 400, headers: corsHeaders })
    }
    const input = body as {
      mode?: unknown
      imageBase64?: unknown
      mediaType?: unknown
      description?: unknown
    }
    if (
      typeof input.imageBase64 !== 'string' ||
      typeof input.description !== 'string' ||
      !input.description.trim() ||
      input.description.length > 500
    ) {
      return Response.json(
        { error: 'Enter a problem description of 500 characters or fewer.', code: 'invalid_description' },
        { status: 400, headers: corsHeaders }
      )
    }
    if (
      input.mediaType !== 'image/jpeg' &&
      input.mediaType !== 'image/png' &&
      input.mediaType !== 'image/webp'
    ) {
      return Response.json(
        { error: 'Use a JPEG, PNG, or WebP image.', code: 'invalid_image_type' },
        { status: 400, headers: corsHeaders }
      )
    }
    const mediaType = input.mediaType
    const prompt = `You are HomeGenie, a household repair vision assistant. Analyze the image together with the user's problem description. User's description of the problem: ${input.description.trim()}. Respond with ONLY valid JSON (no markdown) using this schema:
{
  "issueName": string,
  "confidence": number 0-100,
  "summary": string,
  "severity": "low" | "medium" | "high",
  "recommendedFix": string,
  "recommendedTools": string[],
  "nextStepAdvice": string,
  "safetyWarning": string,
  "explanation": string
}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60_000)
    let response: Response
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1536,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: input.imageBase64 },
              },
              { type: 'text', text: prompt },
            ],
          }],
        }),
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) {
        console.error('Anthropic request timed out after 60000 ms.')
        return Response.json(
          { error: 'The AI service took too long to respond. Please try again.', code: 'provider_timeout' },
          { status: 504, headers: corsHeaders }
        )
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
    if (!response.ok) {
      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      const providerError = safeProviderError(payload)
      console.error('Anthropic request failed:', {
        status: response.status,
        type: providerError.type,
        message: providerError.message,
      })
      return Response.json(
        {
          error: providerErrorMessage(response.status),
          code: 'provider_error',
          status: response.status,
        },
        { status: 502, headers: corsHeaders }
      )
    }

    const result: unknown = await response.json()
    if (!result || typeof result !== 'object') {
      throw new Error('Analysis provider returned an invalid response.')
    }
    const content = (result as {
      content?: { type?: string; text?: string }[]
    }).content
    const text = content?.find((item) => item.type === 'text')?.text ?? ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Analysis provider did not return a diagnosis.')
    let diagnosis: unknown
    try {
      diagnosis = JSON.parse(match[0])
    } catch {
      throw new Error('Analysis provider returned malformed diagnosis JSON.')
    }
    if (
      !diagnosis ||
      typeof diagnosis !== 'object' ||
      typeof (diagnosis as Record<string, unknown>).issueName !== 'string' ||
      typeof (diagnosis as Record<string, unknown>).summary !== 'string' ||
      typeof (diagnosis as Record<string, unknown>).recommendedFix !== 'string' ||
      typeof (diagnosis as Record<string, unknown>).confidence !== 'number' ||
      !Array.isArray((diagnosis as Record<string, unknown>).recommendedTools)
    ) {
      throw new Error('Analysis provider returned an invalid diagnosis.')
    }
    const value = diagnosis as Record<string, unknown>
    if (
      !['low', 'medium', 'high'].includes(String(value.severity)) ||
      !Number.isFinite(value.confidence) ||
      Number(value.confidence) < 0 ||
      Number(value.confidence) > 100
    ) {
      throw new Error('Analysis provider returned an invalid diagnosis.')
    }
    return Response.json(diagnosis, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image analysis failed.'
    console.error('Image analysis processing failed:', message)
    return Response.json(
      { error: 'The AI service returned an invalid diagnosis. Please try again.', code: 'invalid_provider_response' },
      { status: 502, headers: corsHeaders }
    )
  }
})
