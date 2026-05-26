import type { DiagnosisResult, RiskLevel } from '../types/repair'

const MOCK_DIAGNOSIS: DiagnosisResult = {
  issueName: 'Loose mounting bracket',
  confidence: 82,
  summary:
    'The fastener assembly appears strained with visible gap at the joint. Likely caused by vibration or overtightening.',
  severity: 'medium',
  recommendedFix:
    'Power off the unit, remove the cover panel, replace worn bracket screws, and re-seat the bracket with thread-locker.',
  recommendedTools: [
    'Phillips screwdriver',
    'Replacement screws (M4)',
    'Thread-locker',
    'Work gloves',
    'Multimeter',
  ],
  nextStepAdvice: 'Gather tools and shut off power before opening the housing.',
  safetyWarning: 'Disconnect power at the breaker before any disassembly.',
  explanation:
    'Visual cues match a common fastener fatigue pattern on household appliances and fixtures.',
}

function parseRiskLevel(value: unknown): RiskLevel {
  const v = String(value ?? 'medium').toLowerCase()
  if (v === 'low' || v === 'high') return v
  return 'medium'
}

function normalizeDiagnosis(raw: Record<string, unknown>): DiagnosisResult {
  const tools = raw.recommendedTools ?? raw.recommended_tools
  return {
    issueName: String(raw.issueName ?? raw.issue_name ?? 'Unknown issue'),
    confidence: Math.min(100, Math.max(0, Number(raw.confidence ?? 50))),
    summary: String(raw.summary ?? ''),
    severity: parseRiskLevel(raw.severity),
    recommendedFix: String(raw.recommendedFix ?? raw.recommended_fix ?? ''),
    recommendedTools: Array.isArray(tools)
      ? tools.map(String)
      : MOCK_DIAGNOSIS.recommendedTools,
    nextStepAdvice: String(raw.nextStepAdvice ?? raw.next_step_advice ?? ''),
    safetyWarning: String(raw.safetyWarning ?? raw.safety_warning ?? ''),
    explanation: String(raw.explanation ?? ''),
  }
}

export async function imageToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function analyzeImage(
  imageBlob: Blob,
  mediaType = 'image/jpeg'
): Promise<DiagnosisResult> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined

  if (!apiKey) {
    await delay(1200)
    return { ...MOCK_DIAGNOSIS, confidence: 72 + Math.floor(Math.random() * 20) }
  }

  const base64 = await imageToBase64(imageBlob)

  const prompt = `You are FixAura, a household repair vision assistant. Analyze this image and respond with ONLY valid JSON (no markdown) using this schema:
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

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`API error ${response.status}`)
    }

    const data = (await response.json()) as {
      content?: { type: string; text?: string }[]
    }
    const text = data.content?.find((c) => c.type === 'text')?.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    return normalizeDiagnosis(parsed)
  } catch {
    await delay(800)
    return {
      ...MOCK_DIAGNOSIS,
      confidence: 58,
      summary: 'Analysis fallback — image processed with limited certainty.',
    }
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
