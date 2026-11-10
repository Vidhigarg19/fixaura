export type RiskLevel = 'low' | 'medium' | 'high'

export type VerificationStatus = 'resolved' | 'monitor' | 'unresolved' | 'professional'

/** Lifecycle of a durable repair session row (S06). */
export type RepairStatus = 'in_progress' | 'completed'

export interface RepairVerification {
  status: VerificationStatus
  summary: string
  checks: Array<{ label: string; passed: boolean }>
  nextAdvice: string
}

/**
 * S08 — Truthful before/after observation.
 *
 * Deliberately has NO "resolved"/"safe"/"certified" state. An observation
 * reports only what is VISIBLE between two photos; it never certifies that a
 * repair is safe or that a hidden fault is gone.
 *
 *  - visible_change       a clear visual difference is observable
 *  - no_clear_change      the views are comparable but show no clear difference
 *  - incomparable         the two views can't be meaningfully compared
 *                         (different angle/subject, or no before image)
 *  - insufficient_evidence poor lighting / blur / occlusion / provider timeout:
 *                         not enough to say anything
 *  - professional_review  a hazard (electrical/structural/gas/...) means a
 *                         professional must assess it regardless of appearance
 */
export type ObservationStatus =
  | 'visible_change'
  | 'no_clear_change'
  | 'incomparable'
  | 'insufficient_evidence'
  | 'professional_review'

export interface ObservationResult {
  status: ObservationStatus
  /** Plain description of what was (or was not) visible. Never a safety claim. */
  summary: string
  /** What could not be judged from the photos (lighting, angle, hidden internals). */
  limitations: string[]
  /** Explicit cautions, especially hidden-fault and hazard warnings. */
  warnings: string[]
  /** Neutral next step. For professional_review this points to a professional. */
  nextAdvice: string
  /**
   * True only when a safety screen forced professional_review on top of the
   * observed visual state. Surfaced so the UI can show the hazard alert and
   * never present the result as "done/safe".
   */
  safetyOverride: boolean
  /** Which observation policy produced this result (for audit + stale detection). */
  policyVersion: string
  /** When the observation was made (ISO), set on persistence. */
  observedAt?: string
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
  safetyStop?: boolean
  verification?: RepairVerification
  /**
   * Issue-specific repair steps authored by the model and validated on the server and
   * again on the client (see utils/guideSteps). Only present for low/medium severity
   * results; a blocked result never carries steps.
   */
  guideSteps?: RepairStep[]
}

export interface RepairStep {
  id: string
  title: string
  instruction: string
  safetyNote: string
  requiresConfirmation: boolean
  visualCue: 'arrow' | 'box' | 'circle' | 'line'
  estimatedSeconds: number
  /**
   * Optional image for this specific step: a private storage path or a URL. Only
   * reviewed templates set it. When missing or broken, the guide shows the session's
   * own photo, then a clean illustration.
   */
  mediaUrl?: string
}

export interface RepairSession {
  diagnosis: DiagnosisResult
  ownerUserId?: string
  diagnosisAttemptId?: string
  diagnosisPersistence?: {
    /**
     * The user these ids were saved for. Absent when not known (D21: e.g. a repair
     * restored from the database into a cache that never recorded it). The save only
     * reuses ids whose userId matches the signed-in user.
     */
    userId?: string
    applianceId?: string
    diagnosisId?: string
    repairSessionId?: string
  }
  imageDataUrl?: string
  /**
   * Private storage path of this repair's main photo (repair_sessions.image_path). Unlike
   * imageDataUrl it survives a new tab and a resumed session; render it through
   * resolveMediaUrl (a signed URL), never as a raw URL.
   */
  imagePath?: string
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
  /** S07: follow-up symptom answers keyed by question id. */
  symptomAnswers?: Record<string, string | string[]>
  /** S08: the truthful before/after observation result for this repair. */
  observation?: ObservationResult
  /** S09: private-storage object paths uploaded for this session (before/after media). */
  mediaPaths?: string[]
}
