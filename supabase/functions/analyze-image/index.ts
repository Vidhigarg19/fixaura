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
      mode?: unknown
      imageBase64?: unknown
      mediaType?: unknown
      description?: unknown
      afterImageBase64?: unknown
      afterMediaType?: unknown
      beforeImageBase64?: unknown
      beforeMediaType?: unknown
      issueName?: unknown
      stepsSummary?: unknown
      locale?: unknown
      note?: unknown
    }

    if (input.mode === 'verify') {
      const rawAfter = typeof input.afterImageBase64 === 'string'
        ? input.afterImageBase64
        : typeof input.imageBase64 === 'string'
          ? input.imageBase64
          : ''
      const cleanAfter = rawAfter.includes(',') ? rawAfter.split(',')[1] : rawAfter
      if (!cleanAfter) {
        return Response.json(
          { error: 'An after-repair photo is required for verification.' },
          { status: 400, headers: corsHeaders }
        )
      }

      const rawBefore = typeof input.beforeImageBase64 === 'string' ? input.beforeImageBase64 : ''
      const cleanBefore = rawBefore.includes(',') ? rawBefore.split(',')[1] : rawBefore
      const issueName = typeof input.issueName === 'string' && input.issueName.trim()
        ? input.issueName.trim()
        : 'Household repair'
      const description = typeof input.description === 'string' ? input.description.trim() : ''
      const stepsSummary = typeof input.stepsSummary === 'string' ? input.stepsSummary.trim() : ''
      const note = typeof input.note === 'string' ? input.note.trim() : ''
      const locale = input.locale === 'hi' ? 'hi' : 'en'

      const afterMediaType =
        input.afterMediaType === 'image/png' || input.afterMediaType === 'image/webp'
          ? input.afterMediaType
          : input.mediaType === 'image/png' || input.mediaType === 'image/webp'
            ? input.mediaType
            : 'image/jpeg'

      const beforeMediaType =
        input.beforeMediaType === 'image/png' || input.beforeMediaType === 'image/webp'
          ? input.beforeMediaType
          : 'image/jpeg'

      const content: Array<Record<string, unknown>> = []

      if (cleanBefore) {
        content.push({ type: 'text', text: 'BEFORE REPAIR PHOTO:' })
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: beforeMediaType, data: cleanBefore },
        })
      }

      content.push({ type: 'text', text: 'AFTER REPAIR PHOTO:' })
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: afterMediaType, data: cleanAfter },
      })

      const langInstruction = locale === 'hi'
        ? 'All textual fields (summary, checks labels, nextAdvice) MUST be written in natural, clear Hindi.'
        : 'All textual fields (summary, checks labels, nextAdvice) must be written in clear English.'

      const prompt = `You are FixAura, an AI household repair verification assistant.
You are evaluating whether a household repair was successfully and safely completed.

CONTEXT:
- Issue Name: ${issueName}
- Problem Description: ${description || 'Not provided'}
- Steps Completed: ${stepsSummary || 'Standard guided repair steps'}
${note ? `- User Repair Notes: ${note}` : ''}

EVALUATION CRITERIA:
1. Examine the after-repair photo ${cleanBefore ? 'and compare it with the before-repair photo' : 'carefully'}.
2. Check for alignment, secure fastening, absence of leaks/gaps/exposed wiring/hazards, and clean reassembly.
3. Categorize into EXACTLY one of these four status strings:
   - "resolved": Repair appears successful, secure, and properly aligned.
   - "monitor": Repair is functional but should be monitored for 24 hours (e.g. slight play, testing under load, observing for moisture).
   - "unresolved": Visual cues show the original issue persists or the repair is incomplete.
   - "professional": Structural, electrical, high-pressure gas/water, or safety hazard detected. When status is "professional", recommend professional inspection and include a prominent safety warning in nextAdvice.
4. Provide 2 to 4 visual checks in the "checks" array with descriptive "label" and boolean "passed".
5. Provide practical, concise next steps in "nextAdvice".
6. ${langInstruction}

Respond with ONLY valid JSON (no markdown formatting, no code fences):
{
  "status": "resolved" | "monitor" | "unresolved" | "professional",
  "summary": string,
  "checks": [
    { "label": string, "passed": boolean }
  ],
  "nextAdvice": string
}`

      content.push({ type: 'text', text: prompt })

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
          messages: [{ role: 'user', content }],
        }),
      })

      if (!response.ok) {
        throw new Error(`Analysis provider returned ${response.status}.`)
      }

      const result: unknown = await response.json()
      if (!result || typeof result !== 'object') {
        throw new Error('Analysis provider returned an invalid response.')
      }
      const rawContent = (result as {
        content?: { type?: string; text?: string }[]
      }).content
      const responseText = rawContent?.find((item) => item.type === 'text')?.text ?? ''
      const match = responseText.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Analysis provider did not return verification output.')

      const parsed: unknown = JSON.parse(match[0])
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Analysis provider returned an invalid verification object.')
      }

      const parsedRecord = parsed as Record<string, unknown>
      const rawStatus = String(parsedRecord.status ?? 'monitor').toLowerCase()
      const status =
        rawStatus === 'resolved' || rawStatus === 'monitor' || rawStatus === 'unresolved' || rawStatus === 'professional'
          ? rawStatus
          : 'monitor'

      const summary = typeof parsedRecord.summary === 'string' && parsedRecord.summary.trim()
        ? parsedRecord.summary.trim()
        : 'Repair verification completed.'

      const rawChecks = Array.isArray(parsedRecord.checks) ? parsedRecord.checks : []
      const checks = rawChecks.map((item) => {
        const itemRecord = (item && typeof item === 'object') ? (item as Record<string, unknown>) : {}
        return {
          label: String(itemRecord.label ?? 'Visual inspection'),
          passed: Boolean(itemRecord.passed),
        }
      })

      const nextAdvice = typeof parsedRecord.nextAdvice === 'string' && parsedRecord.nextAdvice.trim()
        ? parsedRecord.nextAdvice.trim()
        : 'Continue observing operation over the next 24 hours.'

      return Response.json(
        {
          status,
          summary,
          checks,
          nextAdvice,
          mock: false,
        },
        { headers: corsHeaders }
      )
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
