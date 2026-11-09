import { isNetworkError, isOffline } from './networkError'

export type DeleteOutcome = 'deleted' | 'failed' | 'offline' | 'busy'

export interface DeleteFlow {
  readonly pending: boolean
  /** Deletes once. A second call while one is running returns 'busy' and sends nothing. */
  run(id: string): Promise<DeleteOutcome>
}

/**
 * Delete logic for one confirmation dialog, kept apart from the UI so it can be tested.
 * - offline: no request is sent
 * - a running delete blocks a second submit (no double delete)
 * - the delete function reports success with `true`
 */
export function createDeleteFlow(
  deleteFn: (id: string) => Promise<boolean>,
  online: () => boolean = () => !isOffline()
): DeleteFlow {
  let pending = false
  return {
    get pending() {
      return pending
    },
    async run(id: string) {
      if (pending) return 'busy'
      if (!online()) return 'offline'
      pending = true
      try {
        return (await deleteFn(id)) ? 'deleted' : 'failed'
      } catch (error) {
        return isNetworkError(error) ? 'offline' : 'failed'
      } finally {
        pending = false
      }
    },
  }
}
