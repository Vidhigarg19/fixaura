declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: corsHeaders })
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
        { error: 'A photo and a valid problem description are required.' },
        { status: 400, headers: corsHeaders }
      )
    }
    const mediaType =
      input.mediaType === 'image/png' || input.mediaType === 'image/webp'
        ? input.mediaType
        : 'image/jpeg'
    const prompt = `You are FixAura, a household repair vision assistant. Analyze the image together with the user's problem description. User's description of the problem: ${input.description.trim()}. Respond with ONLY valid JSON (no markdown) using this schema:
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
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
    })
    if (!response.ok) {
      throw new Error(`Analysis provider returned ${response.status}.`)
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
    const diagnosis: unknown = JSON.parse(match[0])
    if (!diagnosis || typeof diagnosis !== 'object') {
      throw new Error('Analysis provider returned an invalid diagnosis.')
    }
    return Response.json(diagnosis, { headers: corsHeaders })
  } catch (error) {
    console.error('Image analysis failed:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Image analysis failed.' },
      { status: 502, headers: corsHeaders }
    )
  }
})
