// Description-only draft for the capture page. The photo is never stored.
const DRAFT_KEY = 'homegenie-capture-draft'
const MAX_DRAFT_LENGTH = 500

interface Draft {
  userId: string
  description: string
}

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { userId, description } = value as Record<string, unknown>
    return typeof userId === 'string' && typeof description === 'string'
      ? { userId, description }
      : null
  } catch {
    return null
  }
}

export function clearCaptureDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // Storage may be unavailable (private mode); a draft is optional.
  }
}

/** Returns the saved description for this user, or ''. A different user's draft is erased. */
export function loadCaptureDraft(userId: string): string {
  const draft = readDraft()
  if (!draft) return ''
  if (draft.userId !== userId) {
    clearCaptureDraft()
    return ''
  }
  return draft.description.slice(0, MAX_DRAFT_LENGTH)
}

export function saveCaptureDraft(userId: string, description: string) {
  if (!description.trim()) {
    clearCaptureDraft()
    return
  }
  try {
    const draft: Draft = { userId, description: description.slice(0, MAX_DRAFT_LENGTH) }
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Ignore quota or privacy-mode failures.
  }
}
