export type RiskLevel = 'low' | 'medium' | 'high'

export type VerificationStatus = 'resolved' | 'monitor' | 'unresolved' | 'professional'

export interface RepairVerification {
  status: VerificationStatus
  summary: string
  checks: Array<{ label: string; passed: boolean }>
  nextAdvice: string
  mock: boolean
}

export interface DiagnosisResult {
  issueName: string
  confidence: number
  summary: string
  severity: RiskLevel
  recommendedFix: string
  recommendedTools: string[]
  nextStepAdvice: string
  safetyWarning: string
  explanation?: string
  verification?: RepairVerification
}

export interface RepairStep {
  id: string
  title: string
  instruction: string
  safetyNote: string
  requiresConfirmation: boolean
  visualCue: 'arrow' | 'box' | 'circle' | 'line'
  estimatedSeconds: number
}

export interface RepairSession {
  diagnosis: DiagnosisResult
  diagnosisAttemptId?: string
  diagnosisPersistence?: {
    userId: string
    applianceId?: string
    diagnosisId?: string
    repairSessionId?: string
  }
  imageDataUrl?: string
  description: string
  toolsAcknowledged?: string[]
  completedAt?: string
  completedRepair?: {
    id: string
    diagnosisId: string
    repairSummary: string | null
    completedAt: string
    feedbackRating: number | null
  }
  moneySaved?: number
  timeSavedMinutes?: number
  historySessionId?: string
  steps?: RepairStep[]
  currentStep?: number
}
