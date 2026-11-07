import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiagnosisResult, RepairSession } from '../types/repair'
import { getSession, saveSession } from '../services/repairSession'
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
