import type { DiagnosisResult, RepairSession } from '../types/repair'

const KEY = 'fixaura-session'

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

export function setDiagnosis(diagnosis: DiagnosisResult, imageDataUrl?: string) {
  saveSession({ diagnosis, imageDataUrl })
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
