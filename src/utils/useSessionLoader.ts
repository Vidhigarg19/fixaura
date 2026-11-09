import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../components/authContext'
import {
  createLatestOnlyLoader,
  isValidSessionId,
  loadOwnSession,
  writeVerifiedSessionToCache,
  type LoadOutcome,
  type ResumeView,
} from '../services/sessionResume'
import { readFixtureName } from './fixtureGate'

export type SessionLoaderState =
  | { status: 'auth_loading' }
  | { status: 'signed_out' }
  | { status: 'loading' }
  | { status: 'ready'; view: ResumeView }
  | { status: 'not_found' }
  | { status: 'offline'; retry: () => void }
  | { status: 'error'; retry: () => void }

export interface SessionLoader {
  /** True when the page must render from the database (a ?session id or a session fixture). */
  active: boolean
  sessionId: string | null
  /** Dev fixture name, or null. Always null in a production build. */
  fixtureName: string | null
  state: SessionLoaderState
}

/** True when the current URL asks for a saved session (or a dev session fixture). */
export function useSessionMode(): boolean {
  const [params] = useSearchParams()
  return params.has('session') || Boolean(readFixtureName()?.startsWith('session_'))
}

/**
 * Loads the session named by ?session for the signed-in user.
 * - Nothing from the browser cache is ever shown while ?session is present.
 * - Until the database answers for THIS id and THIS user, the state is a loading
 *   state, so content from another id or user can never appear.
 * - Offline retries once automatically when the browser comes back online.
 */
export function useSessionLoader(): SessionLoader {
  const [params] = useSearchParams()
  const sessionId = params.get('session')
  const [fixtureName] = useState(readFixtureName)
  const isFixture = fixtureName !== null
  const active = sessionId !== null || Boolean(fixtureName?.startsWith('session_'))

  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const [attempt, setAttempt] = useState(0)
  const [loader] = useState(createLatestOnlyLoader)
  const [settled, setSettled] = useState<{ key: string; outcome: LoadOutcome } | null>(null)

  // Fixtures never need a signed-in user because they never call the real service.
  const needsAuth = !isFixture
  const idValid = isFixture || isValidSessionId(sessionId)
  const key = `${isFixture ? `f:${fixtureName}` : `u:${userId ?? ''}`}|${sessionId ?? ''}|${attempt}`
  const canRequest = active && idValid && (!needsAuth || (!authLoading && userId !== null))

  useEffect(() => {
    if (!canRequest) return
    let load: () => Promise<LoadOutcome>
    if (import.meta.env.DEV && fixtureName) {
      const name = fixtureName
      load = () => import('../dev/sessionFixtures').then((m) => m.resolveFixtureSession(name, sessionId))
    } else {
      const id = sessionId as string
      const owner = userId as string
      load = () => loadOwnSession(id, owner)
    }
    loader.run(load, (outcome) => {
      if (!isFixture && outcome.kind === 'ready' && userId) {
        writeVerifiedSessionToCache(outcome.view, userId)
      }
      setSettled({ key, outcome })
    })
    return () => loader.cancel()
  }, [canRequest, key, loader, fixtureName, isFixture, sessionId, userId])

  const retry = () => setAttempt((value) => value + 1)

  let state: SessionLoaderState
  if (needsAuth && authLoading) state = { status: 'auth_loading' }
  else if (needsAuth && !userId) state = { status: 'signed_out' }
  else if (!idValid) state = { status: 'not_found' }
  else if (!settled || settled.key !== key) state = { status: 'loading' }
  else if (settled.outcome.kind === 'ready') state = { status: 'ready', view: settled.outcome.view }
  else if (settled.outcome.kind === 'offline') state = { status: 'offline', retry }
  else if (settled.outcome.kind === 'error') state = { status: 'error', retry }
  else state = { status: 'not_found' }

  // Retry once when the browser reports that the connection is back.
  const offline = active && state.status === 'offline'
  useEffect(() => {
    if (!offline) return
    const onOnline = () => setAttempt((value) => value + 1)
    window.addEventListener('online', onOnline, { once: true })
    return () => window.removeEventListener('online', onOnline)
  }, [offline, key])

  return { active, sessionId, fixtureName, state }
}
