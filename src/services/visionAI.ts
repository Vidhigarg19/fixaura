import type { DiagnosisResult, RiskLevel } from '../types/repair'
import { supabase } from './supabase'

const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function invocationErrorMessage(error: unknown): Promise<string> {
  if (isRecord(error) && error.context instanceof Response) {
    const response = error.context
    try {
      const body: unknown = await response.json()
      if (isRecord(body) && typeof body.error === 'string') {
        return body.error.slice(0, 300)
      }
    } catch {
      // Use the status-only fallback below when the response isn't JSON.
    }
    return `The diagnosis service returned an error (HTTP ${response.status}).`
  }
  if (isRecord(error) && error.name === 'FunctionsFetchError') {
    return 'Could not reach the diagnosis service. Check your connection and try again.'
  }
  return 'The diagnosis service could not complete the request. Please try again.'
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
      : [],
    nextStepAdvice: String(raw.nextStepAdvice ?? raw.next_step_advice ?? ''),
    safetyWarning: String(raw.safetyWarning ?? raw.safety_warning ?? ''),
    explanation: String(raw.explanation ?? ''),
  }
}

export async function imageToBase64(blob: Blob): Promise<string> {
  if (blob.size === 0) throw new Error('The selected image is empty.')
  if (!supportedImageTypes.has(blob.type.toLowerCase())) {
    throw new Error('Use a JPEG, PNG, or WebP image.')
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The selected image could not be read.'))
        return
      }
      const result = reader.result
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function analyzeImage(
  imageBlob: Blob,
  description: string
): Promise<DiagnosisResult> {
  if (!supabase) {
    throw new Error('Image analysis is unavailable because Supabase is not configured.')
  }
  if (!description.trim() || description.length > 500) {
    throw new Error('Enter a problem description of 500 characters or fewer.')
  }

  const base64 = await imageToBase64(imageBlob)
  const mediaType = imageBlob.type.toLowerCase()
  const { data, error } = await supabase.functions.invoke('analyze-image', {
    body: { imageBase64: base64, mediaType, description },
  })
  if (error) throw new Error(await invocationErrorMessage(error))
  if (!data || typeof data !== 'object') {
    throw new Error('The analysis service returned an invalid response.')
  }
  return normalizeDiagnosis(data as Record<string, unknown>)
}
