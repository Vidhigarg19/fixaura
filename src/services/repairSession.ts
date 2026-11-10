import type { DiagnosisResult, RepairSession } from '../types/repair'
import { SESSION_STORAGE_KEY as KEY } from '../config/storageKeys'

export function getSession(): RepairSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as RepairSession
  } catch {
    return null
  }
}

export function saveSession(partial: Partial<RepairSession>) {
  const existing = getSession() ?? ({} as RepairSession)
  const next = { ...existing, ...partial }
  sessionStorage.setItem(KEY, JSON.stringify(next))
}

export function isValidDiagnosisResult(value: unknown): value is DiagnosisResult {
  if (!value || typeof value !== 'object') return false
  const diagnosis = value as Partial<DiagnosisResult>
  return (
    typeof diagnosis.issueName === 'string' &&
    diagnosis.issueName.trim().length > 0 &&
    diagnosis.issueName.trim().toLowerCase() !== 'unknown issue' &&
    typeof diagnosis.summary === 'string' &&
    diagnosis.summary.trim().length > 0 &&
    typeof diagnosis.recommendedFix === 'string' &&
    diagnosis.recommendedFix.trim().length > 0 &&
    typeof diagnosis.confidence === 'number' &&
    Number.isFinite(diagnosis.confidence) &&
    diagnosis.confidence >= 0 &&
    diagnosis.confidence <= 100 &&
    (diagnosis.severity === 'low' ||
      diagnosis.severity === 'medium' ||
      diagnosis.severity === 'high') &&
    Array.isArray(diagnosis.recommendedTools)
  )
}

export function isValidDiagnosisSession(
  session: RepairSession | null,
  userId: string | null | undefined
): session is RepairSession {
  return Boolean(
    session &&
    typeof session.diagnosisAttemptId === 'string' &&
    session.diagnosisAttemptId.length > 0 &&
    typeof session.imageDataUrl === 'string' &&
    session.imageDataUrl.startsWith('data:image/') &&
    isValidDiagnosisResult(session.diagnosis) &&
    (
      userId
        ? session.ownerUserId === userId
        : !session.ownerUserId
    )
  )
}

export function setDiagnosis(
  diagnosis: DiagnosisResult,
  imageDataUrl: string,
  description: string,
  ownerUserId?: string
) {
  saveSession({
    diagnosis,
    ownerUserId,
    diagnosisAttemptId: crypto.randomUUID(),
    diagnosisPersistence: undefined,
    imageDataUrl,
    description,
    historySessionId: undefined,
    steps: undefined,
    currentStep: 0,
  })
}
/**
 * D16: a signed-in user explicitly takes over a result made in this tab before they
 * logged in. Only an OWNERLESS, valid result for the same attempt is claimed; a result
 * that already belongs to someone is never reassigned. Returns whether it was claimed.
 */
export function claimGuestSession(attemptId: string | undefined, userId: string): boolean {
  const cached = getSession()
  if (
    !attemptId ||
    !userId ||
    !cached ||
    cached.ownerUserId ||
    cached.diagnosisAttemptId !== attemptId ||
    !isValidDiagnosisSession(cached, undefined)
  ) {
    return false
  }
  saveSession({ ownerUserId: userId })
  return true
}

export function clearSession() {
  sessionStorage.removeItem(KEY)
}

export function estimateSavings(diagnosis: DiagnosisResult) {
  const baseMoney =
    diagnosis.severity === 'high' ? 180 : diagnosis.severity === 'medium' ? 95 : 45
  const baseTime =
    diagnosis.severity === 'high' ? 90 : diagnosis.severity === 'medium' ? 45 : 25
  return {
    moneySaved: baseMoney + Math.round(diagnosis.confidence * 0.2),
    timeSavedMinutes: baseTime,
    wasteAvoidedKg: diagnosis.severity === 'high' ? 2.4 : 1.1,
  }
}
