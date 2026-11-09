import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiagnosisResult, RepairSession } from '../types/repair'
import { getSession, saveSession } from '../services/repairSession'
import { getActiveRepairSession, getRepairSessionById } from '../services/repairSessionDb'
import type { RehydrateResult } from '../services/repairSessionDb'
import type { AgreedDiagnosis } from './diagnosisView'
import { applyDiagnosisUpdate } from './diagnosisUpdate'
import { readFixtureName } from './fixtureGate'

// Where the diagnosis shown on /diagnosis, /tools and /guide comes from.
// - Normal use: the stored session (sessionStorage), read synchronously on first render so
//   there is no flash of the wrong screen.
// - DEV fixture mode only: an in-memory session built from a fixture. Nothing is stored.

type SourceState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; session: RepairSession; extras: AgreedDiagnosis | null }

export interface DiagnosisUpdate {
  diagnosis: DiagnosisResult
  extras: AgreedDiagnosis | null
}

export interface DiagnosisSource {
  status: SourceState['status']
  isFixture: boolean
  session: RepairSession | null
  extras: AgreedDiagnosis | null
  /**
   * Applies a newer server result (e.g. after follow-up answers).
   * Returns false and changes nothing when the current session is already blocked:
   * a blocked session is never downgraded or replaced by the client.
   */
  applyUpdate: (update: DiagnosisUpdate) => boolean
}

function initialState(fixtureName: string | null): SourceState {
  if (fixtureName) return { status: 'loading' }
  const session = getSession()
  return session?.diagnosis ? { status: 'ready', session, extras: null } : { status: 'missing' }
}

export function useDiagnosisSource(): DiagnosisSource {
  const [fixtureName] = useState(readFixtureName)
  const [state, setState] = useState<SourceState>(() => initialState(fixtureName))
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    // DEV-ONLY branch; removed from production builds together with the dynamic import.
    if (import.meta.env.DEV && fixtureName) {
      let alive = true
      void import('../dev/analysisFixtures')
        .then((fixtures) => fixtures.runFixture(fixtureName, 0))
        .then((outcome) => {
          if (!alive) return
          const next: SourceState = {
            status: 'ready',
            session: { diagnosis: outcome.adapted, description: 'Fixture description (test data)' },
            extras: outcome.data,
          }
          stateRef.current = next
          setState(next)
        })
        .catch(() => {
          if (alive) setState({ status: 'missing' })
        })
      return () => {
        alive = false
      }
    }
  }, [fixtureName])

  // S06: the DB is the source of truth. sessionStorage gave us a synchronous
  // first paint (no flash); here we reconcile it against the authoritative
  // repair_sessions row on mount. This is what makes reload / new tab /
  // authenticated reopen restore the real repair state.
  useEffect(() => {
    if (fixtureName) return
    let alive = true

    async function rehydrate() {
      const cached = getSession()
      const cachedId = cached?.diagnosisPersistence?.repairSessionId

      let result: RehydrateResult
      try {
        result = cachedId
          ? await getRepairSessionById(cachedId)
          : await getActiveRepairSession()
      } catch (error) {
        // DB unreachable / transient: keep whatever the cache gave us rather
        // than blanking a working local session. Never throw to the UI here.
        console.warn('Repair session rehydration failed:', error)
        return
      }
      if (!alive) return

      if (result.kind === 'needs_recapture') {
        // The DB row exists but has no usable diagnosis. Do not fabricate one;
        // send the user back to recapture instead of showing a blank screen.
        setState({ status: 'missing' })
        return
      }

      if (result.kind !== 'ready') {
        // 'none' | 'unauthenticated': nothing authoritative to apply. If the
        // local cache had no usable session either, surface 'missing'.
        if (!cached?.diagnosis && stateRef.current.status !== 'ready') {
          setState({ status: 'missing' })
        }
        return
      }

      // Merge DB-authoritative fields over the cache. Cache-only fields
      // (imageDataUrl / ownerUserId / diagnosisAttemptId / persistence) are
      // preserved so the current flow keeps working; the DB wins on the
      // durable fields (diagnosis / steps / currentStep).
      const dbSession = result.session
      const dbSteps = dbSession.steps ?? []
      const merged: RepairSession = {
        ...(cached ?? {}),
        diagnosis: dbSession.diagnosis,
        description: dbSession.description || cached?.description || '',
        steps: dbSteps.length ? dbSteps : cached?.steps,
        currentStep: dbSession.currentStep,
        historySessionId: result.sessionId,
        diagnosisPersistence: {
          userId: cached?.diagnosisPersistence?.userId ?? '',
          ...cached?.diagnosisPersistence,
          repairSessionId: result.sessionId,
          diagnosisId:
            result.diagnosisId ?? cached?.diagnosisPersistence?.diagnosisId,
          applianceId:
            result.applianceId ?? cached?.diagnosisPersistence?.applianceId,
        },
      }

      saveSession(merged)
      const nextExtras = stateRef.current.status === 'ready' ? stateRef.current.extras : null
      setState({ status: 'ready', session: merged, extras: nextExtras })
    }

    void rehydrate()
    return () => {
      alive = false
    }
  }, [fixtureName])

  const applyUpdate = useCallback(
    (update: DiagnosisUpdate) => {
      const current = stateRef.current
      if (current.status !== 'ready') return false

      const result = applyDiagnosisUpdate(
        { diagnosis: current.session.diagnosis, extras: current.extras },
        update
      )
      if (!result.accepted) return false

      const next: SourceState = {
        status: 'ready',
        session: { ...current.session, diagnosis: result.state.diagnosis },
        extras: result.state.extras,
      }
      stateRef.current = next
      setState(next)
      if (!fixtureName) saveSession({ diagnosis: result.state.diagnosis })
      return true
    },
    [fixtureName]
  )

  return {
    status: state.status,
    isFixture: fixtureName !== null,
    session: state.status === 'ready' ? state.session : null,
    extras: state.status === 'ready' ? state.extras : null,
    applyUpdate,
  }
}
