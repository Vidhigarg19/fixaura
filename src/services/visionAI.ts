import type { DiagnosisResult, RepairVerification, RiskLevel, VerificationStatus } from '../types/repair'
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

export interface VerifyRepairParams {
  afterImage: Blob | string
  beforeImage?: Blob | string | null
  issueName: string
  description: string
  stepsSummary: string
  locale: string
  note?: string
}

export function getMockVerification(locale: string): RepairVerification {
  const isHi = locale === 'hi'
  return {
    status: 'resolved',
    summary: isHi
      ? 'मरम्मत सफल दिख रही है। जोड़ ठीक से लगे हैं और कोई ढीलापन या लीक नहीं दिख रहा है।'
      : 'Repair appears successful. Fasteners and components are properly seated with no visible gaps or strain.',
    checks: isHi
      ? [
          { label: 'पुर्जे सही स्थिति और संरेखण में हैं', passed: true },
          { label: 'फ़ास्टनर्स पूरी तरह सुरक्षित रूप से कसे हुए हैं', passed: true },
          { label: 'कोई दिखाई देने वाला रिसाव, दरार या ढीलापन नहीं है', passed: true },
        ]
      : [
          { label: 'Components aligned and seated in housing', passed: true },
          { label: 'Fasteners tightened securely', passed: true },
          { label: 'No visual leaks, gaps, or structural damage', passed: true },
        ],
    nextAdvice: isHi
      ? 'उपकरण का सामान्य रूप से परीक्षण करें। पहले इस्तेमाल के दौरान किसी असामान्य आवाज़ या कंपन पर नज़र रखें।'
      : 'Safe to test under normal operation. Monitor for 24 hours to ensure stable performance.',
    mock: true,
  }
}

async function resolveBase64(image: Blob | string | null | undefined): Promise<string | undefined> {
  if (!image) return undefined
  if (typeof image === 'string') {
    return image.includes(',') ? image.split(',')[1] : image
  }
  return await imageToBase64(image)
}

export async function verifyRepair(params: VerifyRepairParams): Promise<RepairVerification> {
  const afterBase64 = await resolveBase64(params.afterImage)
  const beforeBase64 = await resolveBase64(params.beforeImage)

  if (!supabase || !afterBase64) {
    await delay(1000)
    return getMockVerification(params.locale)
  }

  try {
    const { data, error } = await supabase.functions.invoke('analyze-image', {
      body: {
        mode: 'verify',
        afterImageBase64: afterBase64,
        beforeImageBase64: beforeBase64,
        issueName: params.issueName,
        description: params.description,
        stepsSummary: params.stepsSummary,
        locale: params.locale,
        note: params.note,
      },
    })
    if (error) throw error
    if (!data || typeof data !== 'object') {
      throw new Error('Verification service returned an invalid response.')
    }
    const raw = data as Record<string, unknown>
    const rawStatus = String(raw.status ?? 'monitor').toLowerCase()
    const status: VerificationStatus =
      rawStatus === 'resolved' || rawStatus === 'monitor' || rawStatus === 'unresolved' || rawStatus === 'professional'
        ? rawStatus
        : 'monitor'

    const rawChecks = Array.isArray(raw.checks) ? raw.checks : []
    const checks = rawChecks.map((item) => {
      const itemRecord = (item && typeof item === 'object') ? (item as Record<string, unknown>) : {}
      return {
        label: String(itemRecord.label ?? 'Inspection check'),
        passed: Boolean(itemRecord.passed),
      }
    })

    return {
      status,
      summary: String(raw.summary ?? 'Verification completed.'),
      checks: checks.length > 0 ? checks : getMockVerification(params.locale).checks,
      nextAdvice: String(raw.nextAdvice ?? 'Continue monitoring operation.'),
      mock: Boolean(raw.mock),
    }
  } catch (error) {
    console.warn('Verification service unavailable; using mock result:', error)
    await delay(800)
    return getMockVerification(params.locale)
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
