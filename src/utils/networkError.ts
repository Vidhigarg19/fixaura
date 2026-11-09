// Small helpers to tell "no connection" apart from other failures.
// Messages are only inspected, never shown or logged.

/** True when the browser reports that it has no network connection. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

const NETWORK_MESSAGE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected/i

/** True for errors caused by a missing or dropped connection. */
export function isNetworkError(error: unknown): boolean {
  if (isOffline()) return true
  if (error instanceof Error) {
    if (error.name === 'AuthRetryableFetchError') return true
    return NETWORK_MESSAGE.test(error.message)
  }
  return false
}
