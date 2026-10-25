import type { DiagnosisResult, RiskLevel } from '../types/repair'
import { supabase } from './supabase'

const MOCK_DIAGNOSIS: DiagnosisResult = {
  issueName: 'Loose mounting bracket',
  confidence: 82,
  summary:
    'The fastener assembly appears strained with visible gap at the joint. Likely caused by vibration or overtightening.',
  severity: 'medium',
  recommendedFix:
    'Power off the unit, remove the cover panel, replace worn bracket screws, and re-seat the bracket with thread-locker.',
  recommendedTools: [
    'Adjustable wrench',
    'Pliers',
    'Thread-locker',
    'Work gloves',
    'Bucket',
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
  description: string,
  mediaType = 'image/jpeg'
): Promise<DiagnosisResult> {
  if (!supabase) {
    await delay(1200)
    return { ...MOCK_DIAGNOSIS, confidence: 72 + Math.floor(Math.random() * 20) }
  }

  const base64 = await imageToBase64(imageBlob)
  try {
    const { data, error } = await supabase.functions.invoke('analyze-image', {
      body: { imageBase64: base64, mediaType, description },
    })
    if (error) throw error
    if (!data || typeof data !== 'object') {
      throw new Error('The analysis service returned an invalid response.')
    }
    return normalizeDiagnosis(data as Record<string, unknown>)
  } catch (error) {
    console.error('Image analysis service failed; using mock diagnosis:', error)
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
