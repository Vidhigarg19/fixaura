import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiagnosisResult, RepairSession } from '../types/repair'
import { getSession, saveSession } from '../services/repairSession'
import {
  getActiveRepairSession,
  getRepairSessionById,
  persistSymptomAnswers,
} from '../services/repairSessionDb'
import type { RehydrateResult } from '../services/repairSessionDb'
import type { AgreedDiagnosis } from './diagnosisView'
import { applyDiagnosisUpdate } from './diagnosisUpdate'
import type { FollowUpAnswers } from './followUpValidation'
import { readFixtureName } from './fixtureGate'
import { loadAnalysisFixtures } from '../config/devFixtures'

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
  /** The cleaned answers that produced this update, for persistence + risk re-eval. */
  answers?: FollowUpAnswers
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
    if (loadAnalysisFixtures && fixtureName) {
      let alive = true
      void loadAnalysisFixtures()
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

      // D10: a fresh diagnosis from this tab (its own attempt id, not yet linked to any
      // row) is never overlaid with the user's latest active repair. Nothing ties that
      // row to this attempt, so its ids and diagnosis belong to ANOTHER repair. The save
      // links the attempt to its own row; after that, rehydration goes by that id below.
      // Real resumes are unaffected: they have a row id, a history id, or no cache at all.
      const freshUnlinkedAttempt = Boolean(
        cached?.diagnosis && cached.diagnosisAttemptId && !cachedId && !cached.historySessionId
      )
      if (freshUnlinkedAttempt) return

      // D11: a cache linked to a row only by its history id (what the saved-session view
      // leaves behind) is reloaded by THAT id, never replaced by the user's latest active
      // repair. Every writer of historySessionId stores a repair_sessions id, and the
      // by-id read is scoped to the signed-in owner. Only an unlinked cache (e.g. a new tab)
      // still falls back to the latest active repair.
      const linkedId = cachedId ?? cached?.historySessionId

      let result: RehydrateResult
      try {
        result = linkedId
          ? await getRepairSessionById(linkedId)
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
      // durable fields (diagnosis / currentStep).
      const dbSession = result.session
      const merged: RepairSession = {
        ...(cached ?? {}),
        diagnosis: dbSession.diagnosis,
        description: dbSession.description || cached?.description || '',
        // D8 / V05: stored steps are not approved guide content, so the database's steps
        // are never copied into the cache (the guide reads cached steps once a guide is
        // available). Whatever the cache already held is left as it was.
        steps: cached?.steps,
        currentStep: dbSession.currentStep,
        // The database path keeps the photo available in a new tab or a resumed session.
        // A freshly captured photo (cached imageDataUrl) still wins for display.
        imagePath: dbSession.imagePath ?? cached?.imagePath,
        historySessionId: result.sessionId,
        // D21: the cached userId is kept when there is one; it is never made up (it used
        // to become '' here). An absent userId means "not known", exactly as '' did.
        diagnosisPersistence: {
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

      // S07: the answers are screened client-side (escalate-only) inside
      // applyDiagnosisUpdate, so a material hazard in the answers blocks even if
      // the server result did not.
      const result = applyDiagnosisUpdate(
        { diagnosis: current.session.diagnosis, extras: current.extras },
        update,
        update.answers
      )
      if (!result.accepted) return false

      // S07: keep the user's answers on the session so they survive reload and
      // can be persisted to the DB. Merge with any prior answers.
      const mergedAnswers = update.answers
        ? { ...(current.session.symptomAnswers ?? {}), ...update.answers }
        : current.session.symptomAnswers

      const next: SourceState = {
        status: 'ready',
        session: {
          ...current.session,
          diagnosis: result.state.diagnosis,
          symptomAnswers: mergedAnswers,
        },
        extras: result.state.extras,
      }
      stateRef.current = next
      setState(next)
      if (!fixtureName) {
        saveSession({ diagnosis: result.state.diagnosis, symptomAnswers: mergedAnswers })
        // Persist answers to the authoritative DB row. Fire-and-forget: a
        // failure here must not block the UI update that already happened.
        const repairSessionId = current.session.diagnosisPersistence?.repairSessionId
        if (repairSessionId && mergedAnswers) {
          void persistSymptomAnswers(repairSessionId, mergedAnswers).catch((error: unknown) => {
            console.warn('Unable to persist follow-up answers:', error)
          })
        }
      }
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
