/**
 * Guards against stale async results. Take a token before starting work; when the work
 * finishes, only act if the token is still current. `invalidate()` (page left, new
 * request started elsewhere) makes every earlier token stale.
 */
export interface RequestGuard {
  next(): number
  isCurrent(token: number): boolean
  invalidate(): void
}

export function createRequestGuard(): RequestGuard {
  let current = 0
  return {
    next: () => {
      current += 1
      return current
    },
    isCurrent: (token) => token === current,
    invalidate: () => {
      current += 1
    },
  }
}
