export type RiskLevel = 'low' | 'medium' | 'high'

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
  imageDataUrl?: string
  toolsAcknowledged?: string[]
  completedAt?: string
  moneySaved?: number
  timeSavedMinutes?: number
}
