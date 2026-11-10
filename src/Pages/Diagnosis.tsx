import { motion } from 'framer-motion'
import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react'
import PageShell from '../components/PageShell'
import FallbackMode from '../components/FallbackMode'
import SafetyBlockedPanel from '../components/SafetyBlockedPanel'
import SafetyDisclaimer from '../components/SafetyDisclaimer'
import FollowUpQuestions from '../components/FollowUpQuestions'
import {
  claimGuestSession,
  getSession as getCachedSession,
  isValidDiagnosisSession,
  saveSession,
} from '../services/repairSession'
import { isValidSessionId, seedRepairCache } from '../services/sessionResume'
import { getLocale, localizedErrorMessage, subscribeLocale, t } from '../i18n'
import {
  DiagnosisSaveCancelledError,
  DiagnosisSaveError,
  saveDiagnosisAndSession,
  type DiagnosisSaveErrorCode,
} from '../services/diagnosisPersistence'
import FixtureBannerSlot from '../components/FixtureBannerSlot'
import { CONFIDENCE_THRESHOLD, DIAGNOSIS_SAVE_TIMEOUT_MS } from '../config/limits'
import { useAuth } from '../components/authContext'
import { buildDiagnosisView, type DiagnosisView } from '../utils/diagnosisView'
import { useDiagnosisSource } from '../utils/useDiagnosisSource'
import { withFixtureQuery } from '../utils/fixtureGate'
import { decideFromDiagnosis, isBlocked, mostSevere, type RiskDecision } from '../utils/riskDecision'
import { safetyRiskSignal, screenFields, type SafetyVerdict } from '../lib/safety'
import { isGuideAvailable } from '../utils/guideAvailability'
import type { FollowUpResult } from '../services/followUpClient'
import type { DiagnosisResult, RepairSession } from '../types/repair'
import { useSessionLoader, useSessionMode } from '../utils/useSessionLoader'
import {
  LegacySessionPanel,
  MissingPhotoNotice,
  SessionFixtureBanner,
  SessionStatePanel,
} from '../components/SessionPanels'

// DEV-ONLY banner. In a production build this is `null` and the import is removed.

interface DiagnosisSaveOperation {
  promise: Promise<void>
  /** Pages currently waiting for this save. */
  waiting: number
  /** Inserts/backfills in flight (they may still commit in the database). */
  writesInFlight: number
  /** D9: given up after the wait limit; it starts nothing new and writes no cache. */
  abandoned: boolean
}

interface DiagnosisSaveContext {
  isCancelled: () => boolean
  isAbandoned: () => boolean
  onWriteInFlight: (inFlight: boolean) => void
}

const diagnosisSaveOperations = new Map<string, DiagnosisSaveOperation>()

/**
 * One save per attempt id, shared by every page waiting for it. Each caller gets a
 * `release` for its effect cleanup.
 * - D4: the save is cancelled (at its next database step) only when NO page is waiting
 *   any more. It is read lazily, so a StrictMode remount or a second page keeps it running.
 * - D9: each wait is bounded by DIAGNOSIS_SAVE_TIMEOUT_MS and then fails as `timedOut`
 *   (the normal failed state, with retry). If no write is in flight, the stuck save is
 *   abandoned and dropped, so a retry starts a fresh one; it can no longer start a write.
 *   If a write IS in flight, the save is kept: there is no database uniqueness to stop a
 *   duplicate row, so a retry rejoins it (with a new limit) instead of competing with it.
 */
function saveDiagnosisOnce(attemptId: string, save: (context: DiagnosisSaveContext) => Promise<void>) {
  let operation = diagnosisSaveOperations.get(attemptId)
  if (!operation) {
    const created: DiagnosisSaveOperation = {
      promise: Promise.resolve(),
      waiting: 0,
      writesInFlight: 0,
      abandoned: false,
    }
    diagnosisSaveOperations.set(attemptId, created)
    // Counted before the save starts, so its synchronous part never sees "nobody waiting".
    created.waiting = 1
    created.promise = save({
      isCancelled: () => created.waiting === 0 || created.abandoned,
      isAbandoned: () => created.abandoned,
      onWriteInFlight: (inFlight) => {
        created.writesInFlight += inFlight ? 1 : -1
      },
    }).finally(() => {
      if (diagnosisSaveOperations.get(attemptId) === created) {
        diagnosisSaveOperations.delete(attemptId)
      }
    })
    operation = created
  } else {
    operation.waiting += 1
  }

  const joined = operation
  let released = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const bounded = new Promise<void>((resolve, reject) => {
    timer = setTimeout(() => {
      if (joined.writesInFlight === 0) {
        joined.abandoned = true
        if (diagnosisSaveOperations.get(attemptId) === joined) diagnosisSaveOperations.delete(attemptId)
      }
      reject(new DiagnosisSaveError('timedOut'))
    }, DIAGNOSIS_SAVE_TIMEOUT_MS)
    joined.promise.then(resolve, reject)
  }).finally(() => clearTimeout(timer))

  return {
    promise: bounded,
    /** The save's own result, however long it takes (D18). */
    outcome: joined.promise,
    release() {
      if (released) return
      released = true
      clearTimeout(timer)
      joined.waiting -= 1
    },
  }
}

// D7: the save's own failure codes map to translated copy. Anything else (Supabase,
// network, auth provider errors) gets the generic copy; its text is never shown.
const SAVE_ERROR_KEYS: Record<DiagnosisSaveErrorCode, string> = {
  signInRequired: 'diagnosis.saveError.signInRequired',
  applianceUnverified: 'diagnosis.saveError.applianceUnverified',
  duplicateAppliances: 'diagnosis.saveError.duplicateAppliances',
  duplicateSessions: 'diagnosis.saveError.duplicateSessions',
  sessionMissingAppliance: 'diagnosis.saveError.sessionLinkInvalid',
  sessionApplianceMismatch: 'diagnosis.saveError.sessionLinkInvalid',
  sessionLinkMismatch: 'diagnosis.saveError.sessionLinkInvalid',
  sessionNotUpdated: 'diagnosis.saveError.sessionNotUpdated',
  timedOut: 'diagnosis.saveError.timedOut',
  sessionCompleted: 'diagnosis.saveError.sessionCompleted',
  sessionAlreadyExists: 'diagnosis.saveError.sessionAlreadyExists',
}

/** D16: the session with the claiming user as owner, once (and only if) they claimed it. */
function withClaimedOwner(session: RepairSession | null, claimedBy: string | null): RepairSession | null {
  return session && claimedBy && !session.ownerUserId ? { ...session, ownerUserId: claimedBy } : session
}

function saveErrorKeyFor(error: unknown): string {
  return error instanceof DiagnosisSaveError ? SAVE_ERROR_KEYS[error.code] : 'diagnosis.saveError.unknown'
}

const RISK_STYLE: Record<
  RiskDecision,
  { labelKey: string; color: string; Icon: typeof CheckCircle2 }
> = {
  safe: { labelKey: 'diagnosis.riskSafe', color: 'text-success border-success/40 bg-success/10', Icon: CheckCircle2 },
  caution: { labelKey: 'diagnosis.riskCaution', color: 'text-warning border-warning/40 bg-warning/10', Icon: AlertTriangle },
  professional: { labelKey: 'diagnosis.riskProfessional', color: 'text-error border-error/40 bg-error/10', Icon: ShieldAlert },
  emergency: { labelKey: 'diagnosis.riskEmergency', color: 'text-error border-error/60 bg-error/15', Icon: AlertOctagon },
}

const EVIDENCE_KEYS = {
  low: { labelKey: 'diagnosis.evidenceLow', filled: 1 },
  medium: { labelKey: 'diagnosis.evidenceMedium', filled: 2 },
  high: { labelKey: 'diagnosis.evidenceHigh', filled: 3 },
} as const

function FreshDiagnosis() {
  useSyncExternalStore(subscribeLocale, getLocale)
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const source = useDiagnosisSource()
  // Initial session only: the persistence effect below must not re-run when a follow-up
  // result changes what is displayed.
  const [initialSession] = useState(() => source.session)
  // D16: set when a signed-in user explicitly chose to save a result made before they
  // logged in. Until then that ownerless result is never saved.
  const [claimedBy, setClaimedBy] = useState<string | null>(null)
  const session = useMemo(() => withClaimedOwner(initialSession, claimedBy), [initialSession, claimedBy])
  const liveSession = useMemo(() => withClaimedOwner(source.session, claimedBy), [source.session, claimedBy])
  // D16: a result made as a guest, now viewed by a signed-in user who has not claimed it.
  const claimableGuestResult =
    !source.isFixture &&
    !authLoading &&
    Boolean(user) &&
    !claimedBy &&
    isValidDiagnosisSession(initialSession, undefined) &&
    isValidDiagnosisSession(source.session, undefined)
  // S05: screen the text that is actually shown (description and result fields).
  const safetyVerdict = liveSession ? screenDiagnosisText(liveSession.description, liveSession.diagnosis) : null
  // The MOST SEVERE of the V04 risk decision (server data) and the S05 text screen.
  // No session means unknown, which is treated as the safer side.
  const decision: RiskDecision = liveSession
    ? combinedDecision(decideFromDiagnosis(liveSession.diagnosis, source.extras), safetyVerdict)
    : 'professional'
  const blocked = isBlocked(decision)
  // S07: guided repair opens only when the agreed diagnosis carries a reviewed,
  // current approved template. The diagnosis itself is still saved by the effect
  // below; only the guided-repair start is gated on template validation.
  const guideAvailable = isGuideAvailable(source.extras, {
    allowFixtureTemplates: source.isFixture,
    diagnosis: liveSession?.diagnosis ?? null,
    decision,
  })
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'failed' | 'signInRequired' | 'alreadyCompleted'>(
    'saving'
  )
  const [saveFailed, setSaveFailed] = useState(false)
  // D7: the translation key for why the last save failed (diagnosis.saveError.*).
  const [saveErrorKey, setSaveErrorKey] = useState<string | null>(null)
  // D14: the owner's finished repair for this diagnosis, when the save found one.
  const [completedRepairId, setCompletedRepairId] = useState<string | null>(null)
  // D3: a guest's result (valid for no owner, auth settled, nobody signed in) is never sent
  // to the save; the page asks them to log in instead.
  const guestResult =
    !source.isFixture && !authLoading && !user && isValidDiagnosisSession(session, undefined)
  const [saveAttempt, setSaveAttempt] = useState(0)
  const [repairSessionReady, setRepairSessionReady] = useState(false)
  const [starting, setStarting] = useState(false)
  const [saveError, setSaveError] = useState('')
  // D1: the ids this page's own save already wrote for an attempt. A retry starts from
  // them (the service still checks the owner and verifies each id) instead of the
  // first-render snapshot, so it does not insert a second diagnoses row. The shared cache
  // is not read for this: rehydration can merge ANOTHER active repair's ids into it.
  const savedProgress = useRef<{
    attemptId: string
    persistence: NonNullable<RepairSession['diagnosisPersistence']>
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    // Set synchronously below (there is no await before saveDiagnosisOnce), so the
    // cleanup always releases this page's hold on the shared save.
    let releaseSave: (() => void) | undefined

    async function saveDiagnosis() {
      if (!isValidDiagnosisSession(session, user?.id)) return
      // D3: no save (and so no auth or database call) until auth has settled on a
      // signed-in user. A guest gets the log-in prompt rendered from guestResult.
      if (authLoading || !user?.id) return
      const attemptId = session.diagnosisAttemptId || crypto.randomUUID()
      if (!session.diagnosisAttemptId) {
        saveSession({ diagnosisAttemptId: attemptId })
      }

      const progress = savedProgress.current
      const diagnosisPersistence =
        progress?.attemptId === attemptId ? progress.persistence : session.diagnosisPersistence

      const operation = saveDiagnosisOnce(attemptId, ({ isCancelled, isAbandoned, onWriteInFlight }) =>
        saveDiagnosisAndSession(
          {
            attemptId,
            diagnosis: session.diagnosis,
            description: session.description,
            diagnosisPersistence,
          },
          {
            readCache: getCachedSession,
            writeCache: (partial) => {
              // D9: an abandoned save was stuck on a read, so it holds no new row id;
              // its late writes (e.g. its starting ids) must not overwrite a newer save's.
              if (isAbandoned()) return
              if (partial.diagnosisPersistence) {
                savedProgress.current = { attemptId, persistence: partial.diagnosisPersistence }
              }
              saveSession(partial)
            },
            isCancelled,
            onWriteInFlight,
          }
        )
      )
      releaseSave = operation.release

      const showSaved = () => {
        if (cancelled) return
        setRepairSessionReady(true)
        setSaveFailed(false)
        setSaveErrorKey(null)
        setSaveStatus('saved')
        // So a refresh or a copied link opens this repair from the database.
        const savedId = getCachedSession()?.diagnosisPersistence?.repairSessionId
        if (isValidSessionId(savedId)) {
          const params = new URLSearchParams(window.location.search)
          params.set('session', savedId)
          navigate({ search: `?${params.toString()}` }, { replace: true })
        }
      }

      const showFailure = (error: unknown) => {
        // A save stopped because every page left is not a failure (and nobody is shown it).
        if (error instanceof DiagnosisSaveCancelledError) return
        // D14: a finished repair already exists for this diagnosis. That is a state to
        // show (with a way forward), not a failure to retry or log.
        if (error instanceof DiagnosisSaveError && error.code === 'sessionCompleted') {
          if (!cancelled) {
            setSaveFailed(false)
            setSaveErrorKey(null)
            setSaveStatus('alreadyCompleted')
            setCompletedRepairId(error.repairSessionId ?? null)
          }
          return
        }
        // An expired session is an expected auth outcome, not an error to log.
        const signInRequired = error instanceof DiagnosisSaveError && error.code === 'signInRequired'
        if (!signInRequired) console.error('Diagnosis save failed:', error)

        if (!cancelled) {
          setSaveFailed(true)
          setSaveStatus(signInRequired ? 'signInRequired' : 'failed')
          setSaveErrorKey(saveErrorKeyFor(error))
        }
      }

      try {
        await operation.promise
        showSaved()
      } catch (error) {
        showFailure(error)
        // D18: the wait timed out but the save itself was kept (a write was in flight).
        // Keep listening: when it does settle, show what really happened. Ignored once
        // this run is cleaned up (left the page, or a retry rejoined the save), and an
        // abandoned save's late "cancelled" outcome is ignored by showFailure.
        if (error instanceof DiagnosisSaveError && error.code === 'timedOut') {
          operation.outcome.then(showSaved, showFailure)
        }
      }
    }

    void saveDiagnosis()

    return () => {
      cancelled = true
      releaseSave?.()
    }
  }, [session, user?.id, authLoading, navigate, saveAttempt])

  const startRepair = async () => {
    if (!liveSession || starting) return
    if (isBlocked(decision)) return
    // Only start a guide that passed the availability gate (never for a blocked result).
    if (!guideAvailable) return
    if (source.isFixture) {
      // Fixture mode never creates a real repair session.
      navigate(withFixtureQuery('/tools'))
      return
    }
    if (!isValidDiagnosisSession(liveSession, user?.id) || !repairSessionReady) return
    const repairSessionId = liveSession.diagnosisPersistence?.repairSessionId
    if (!repairSessionId) {
      setSaveError(t('history.saveError'))
      return
    }
    setStarting(true)
    setSaveError('')
    // S06: the authoritative repair_sessions row was already created/backfilled by the
    // save effect; the single row IS the history row. V05: no generated steps are written
    // to the cache, and cached steps from an older save never unlock or feed the guide.
    try {
      saveSession({
        historySessionId: repairSessionId,
        steps: [],
        currentStep: 0,
      })
      navigate('/tools')
    } catch (error) {
      setSaveError(localizedErrorMessage(error, 'history.saveError'))
    } finally {
      setStarting(false)
    }
  }

  const handleFollowUpResult = (result: FollowUpResult) => {
    // A blocked session is never changed by a later response. applyUpdate enforces this
    // for the risk decision; this guard also covers a block that came from the S05 text
    // screen, so a newer response can never lower it.
    if (blocked) return
    // S07: the answers flow through so they are persisted and re-screened for risk.
    source.applyUpdate({ diagnosis: result.diagnosis, extras: result.extras, answers: result.answers })
  }

  if (source.status === 'loading') {
    return (
      <PageShell className="flex items-center justify-center p-6">
        <div role="status" aria-live="polite" className="glass-panel w-full max-w-sm animate-pulse rounded-2xl p-6">
          <div className="mb-3 h-5 w-2/3 rounded bg-surface-high" />
          <div className="h-3 w-3/4 rounded bg-surface-high" />
          <span className="sr-only">{t('blocked.gateChecking')}</span>
        </div>
      </PageShell>
    )
  }

  const validDiagnosis = source.isFixture
    ? Boolean(liveSession)
    : isValidDiagnosisSession(liveSession, user?.id) || claimableGuestResult
  if (!validDiagnosis || !liveSession) {
    return (
      <PageShell className="flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-text-secondary mb-4">{t('common.error')}</p>
          <Link to="/capture" className="text-primary underline">
            {t('diagnosis.ctaRetake')}
          </Link>
        </div>
      </PageShell>
    )
  }

  const d = liveSession.diagnosis
  const view = buildDiagnosisView(d, source.extras)
  const lowConfidence = d.confidence < CONFIDENCE_THRESHOLD
  const showFollowUps = !blocked && view.followUps.length > 0 && view.sessionId !== null

  return (
    <PageShell className="pb-24">
      <div className="mx-auto max-w-lg px-4 pt-8">
        {source.isFixture && (
          <FixtureBannerSlot name={new URLSearchParams(window.location.search).get('fixture') ?? ''} />
        )}

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-heading-lg mb-8"
        >
          {t('diagnosis.title')}
        </motion.h1>

        {!source.isFixture && (
          <p role="status" className="text-sm text-text-secondary mb-4">
            {claimableGuestResult
              ? t('diagnosis.claim.body')
              : t(`diagnosis.saveStatus.${guestResult ? 'signInRequired' : saveStatus}`)}
          </p>
        )}

        {claimableGuestResult && (
          // D16: saving a result made before logging in needs the user's explicit choice.
          <div className="mb-6 rounded-xl border border-primary/40 bg-primary/5 p-4">
            {/* D19 (option C): the earlier photo is never uploaded, so say so up front. */}
            <p className="mb-3 text-sm text-text-secondary">{t('diagnosis.claim.photoNotSaved')}</p>
            <button
              type="button"
              onClick={() => {
                if (user && claimGuestSession(initialSession?.diagnosisAttemptId, user.id)) {
                  setClaimedBy(user.id)
                }
              }}
              className="min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t('diagnosis.claim.action')}
            </button>
          </div>
        )}

        {!source.isFixture && saveStatus === 'alreadyCompleted' && (
          // D14: a finished repair exists; open it or start a new scan (no dead-end retry).
          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-text-primary">{t('diagnosis.saveError.sessionCompleted')}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              {isValidSessionId(completedRepairId) && (
                <Link
                  to={`/diagnosis?session=${completedRepairId}`}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {t('diagnosis.viewFinishedRepair')}
                </Link>
              )}
              <Link
                to="/capture"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {t('session.scanAgain')}
              </Link>
            </div>
          </div>
        )}

        {!source.isFixture && (saveFailed || guestResult) && (
          <div role="alert" className="mb-6 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm text-warning">{t('session.notSaved')}</p>
              {(guestResult || saveErrorKey) && (
                <p className="mt-1 text-sm text-text-secondary">
                  {t(guestResult ? 'diagnosis.saveError.signInRequired' : (saveErrorKey as string))}
                </p>
              )}
              {guestResult && (
                // D20: the result lives in this tab only; say how to keep it.
                <p className="mt-1 text-xs text-text-subtle">{t('diagnosis.claim.sameTab')}</p>
              )}
            </div>
            {(guestResult || saveStatus === 'signInRequired') && (
              <Link
                to="/login"
                // D16: come back here after logging in, where the result can be saved.
                state={{ from: { pathname: '/diagnosis' } }}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {t('nav.logIn')}
              </Link>
            )}
            {user && (
              <button
                type="button"
                onClick={() => {
                  setSaveFailed(false)
                  setSaveStatus('saving')
                  setSaveErrorKey(null)
                  setSaveAttempt((value) => value + 1)
                }}
                className="min-h-11 rounded-lg border border-warning/50 px-4 py-2 text-sm font-semibold text-warning focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {t('common.retry')}
              </button>
            )}
          </div>
        )}

        {(decision === 'professional' || decision === 'emergency') && (
          <SafetyBlockedPanel
            decision={decision}
            issueName={d.issueName}
            analysisDetails={view.analysisDetails}
          />
        )}

        {lowConfidence && !blocked && (
          <div className="mb-6">
            <FallbackMode
              // Without an approved guide there is nothing to continue to, so the
              // "continue" action is not offered (FallbackMode hides it).
              onContinue={guideAvailable ? () => void startRepair() : undefined}
              continueDisabled={(!source.isFixture && !repairSessionReady) || starting}
            />
          </div>
        )}

        <DiagnosisSections
          diagnosis={d}
          description={liveSession.description}
          view={view}
          decision={decision}
          safetyVerdict={safetyVerdict}
        />

        {showFollowUps && view.sessionId && (
          <FollowUpQuestions
            key={`${view.sessionId}:${view.followUps.map((question) => question.id).join(',')}`}
            questions={view.followUps}
            sessionId={view.sessionId}
            onResult={handleFollowUpResult}
          />
        )}

        <WhyThisResult text={d.explanation || d.summary} />

        {!blocked && (
          <>
            {!guideAvailable && (
              <div className="mb-4 rounded-xl border border-border bg-surface p-4">
                <p className="font-semibold text-text-primary">{t('guide.unavailableTitle')}</p>
                <p className="mt-1 text-sm text-text-secondary">{t('guide.unavailableNoSteps')}</p>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              {guideAvailable && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => void startRepair()}
                  disabled={(!source.isFixture && !repairSessionReady) || starting}
                  className="flex-1 min-h-11 rounded-xl bg-primary py-3 font-semibold text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {starting ? t('common.loading') : t('diagnosis.ctaTools')}
                </motion.button>
              )}

              <Link to="/capture" className="flex-1">
                <motion.span
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="block min-h-11 text-center rounded-xl border border-border py-3 text-text-secondary"
                >
                  {t('diagnosis.ctaRetake')}
                </motion.span>
              </Link>
            </div>
            <button
              type="button"
              onClick={() =>
                navigate(`/nearby-shops?appliance=${encodeURIComponent(d.issueName)}`)
              }
              className="mt-3 min-h-11 w-full rounded-xl border border-primary/50 py-3 font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
            >
              {t('nearby.findShops')}
            </button>
          </>
        )}
        {saveError && <p role="alert" className="mt-4 break-words text-sm text-warning">{saveError}</p>}
      </div>
    </PageShell>
  )
}

const SECTION_CLASS = 'glass-panel rounded-xl p-6 mb-6'

/**
 * S05: screens what the user REPORTED and what the model OBSERVED (issue, summary,
 * recommended fix). The model's generic safetyWarning and its tool list are
 * deliberately NOT screened: they are precautionary boilerplate ("unplug first, stop
 * if you see sparks") and treating them as evidence of a hazard blocked ordinary
 * repairs. Real danger still arrives through the severity/safetyStop fields.
 */
function screenDiagnosisText(description: string | undefined, d: DiagnosisResult): SafetyVerdict {
  return screenFields([description, d.issueName, d.summary, d.recommendedFix])
}

/**
 * RULE: when both the V04 risk decision and the S05 text screen give a decision,
 * take the MOST SEVERE. Never lower than either side.
 */
function combinedDecision(risk: RiskDecision, verdict: SafetyVerdict | null): RiskDecision {
  return verdict ? mostSevere(risk, safetyRiskSignal(verdict)) : risk
}

/** The result sections, shared by a fresh analysis and a saved session. */
function DiagnosisSections({
  diagnosis,
  description,
  view,
  decision,
  safetyVerdict,
}: {
  diagnosis: DiagnosisResult
  description: string
  view: DiagnosisView
  decision: RiskDecision
  safetyVerdict: SafetyVerdict | null
}) {
  const blocked = isBlocked(decision)
  const risk = RISK_STYLE[decision]
  const evidence = EVIDENCE_KEYS[view.evidence]
  const sectionClass = SECTION_CLASS
  return (
    <>
      <div className={sectionClass}>
        <p className="text-label-bold text-text-subtle mb-1">{t('diagnosis.yourDescription')}</p>
        <p className="text-body-md text-text-secondary">{description}</p>
        <p className="text-label-bold text-text-subtle mb-1 mt-5">{t('diagnosis.detectedIssue')}</p>
        <p className="text-heading-md">{diagnosis.issueName}</p>
      </div>

      <section aria-labelledby="diagnosis-noticed" className={sectionClass}>
        <h2 id="diagnosis-noticed" className="text-heading-md mb-3">
          {t('diagnosis.sectionNoticed')}
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-body-md text-text-secondary">
          {view.observations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="diagnosis-causes" className={sectionClass}>
        <h2 id="diagnosis-causes" className="text-heading-md mb-1">
          {t('diagnosis.sectionCauses')}
        </h2>
        <p className="mb-3 text-sm text-text-secondary">{t('diagnosis.causesNote')}</p>
        <ul className="space-y-2">
          {view.possibleCauses.map((cause) => (
            <li key={cause} className="flex flex-wrap items-center gap-2 text-body-md">
              <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-text-subtle">
                {t('diagnosis.possibleBadge')}
              </span>
              <span>{cause}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="diagnosis-sure" className={sectionClass}>
        <h2 id="diagnosis-sure" className="text-heading-md mb-3">
          {t('diagnosis.sectionSure')}
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex w-24 gap-1" aria-hidden="true">
            {[1, 2, 3].map((step) => (
              <span
                key={step}
                className={`h-2 flex-1 rounded-full ${step <= evidence.filled ? 'bg-primary' : 'bg-surface-high'}`}
              />
            ))}
          </div>
          <p className="font-semibold">{t(evidence.labelKey)}</p>
        </div>
        <p className="mt-3 text-sm text-text-secondary">{t('diagnosis.evidenceNote')}</p>
        {view.limitations.length > 0 && (
          <div className="mt-4">
            <h3 className="text-label-bold text-text-subtle mb-1">{t('diagnosis.limitationsHeading')}</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
              {view.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="diagnosis-risk" className={sectionClass}>
        <h2 id="diagnosis-risk" className="text-heading-md mb-3">
          {t('diagnosis.sectionRisk')}
        </h2>
        <p className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold ${risk.color}`}>
          <risk.Icon className="h-4 w-4" aria-hidden="true" />
          {t(risk.labelKey)}
        </p>
        <p className="mt-3 text-sm text-text-secondary">
          {blocked
            ? t('diagnosis.riskBlockedBody')
            : decision === 'caution'
              ? t('diagnosis.riskCautionBody')
              : t('diagnosis.riskSafeBody')}
        </p>
        {/* S05: non-blocking disclaimer. Blocked results use SafetyBlockedPanel instead. */}
        {!blocked && (
          <SafetyDisclaimer
            verdict={safetyVerdict}
            tone={decision === 'caution' ? 'caution' : 'info'}
            className="mt-4"
          />
        )}
      </section>

      {!blocked && (
        <section aria-labelledby="diagnosis-fix" className={sectionClass}>
          <h2 id="diagnosis-fix" className="text-heading-md mb-2">
            {t('diagnosis.recommendedFix')}
          </h2>
          <p className="text-body-md text-text-secondary">{diagnosis.recommendedFix}</p>
        </section>
      )}
    </>
  )
}

function WhyThisResult({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <motion.button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between glass-panel rounded-xl px-4 py-3 mb-8 text-left focus-visible:outline-2 focus-visible:outline-primary"
        whileHover={{ scale: 1.01 }}
      >
        <span className="font-medium">{t('diagnosis.whyResult')}</span>
        {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
      </motion.button>

      {expanded && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="text-text-secondary text-sm mb-8 -mt-4 px-2"
        >
          {text}
        </motion.p>
      )}
    </>
  )
}

/**
 * /diagnosis?session=<id>: always rendered from the database through the loader,
 * never from the browser cache. The stored diagnosis is shown exactly as saved;
 * a blocked result shows the V04 blocked panel and no next steps.
 */
function SavedDiagnosis() {
  useSyncExternalStore(subscribeLocale, getLocale)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { state, fixtureName } = useSessionLoader()
  const isFixture = fixtureName !== null

  if (state.status !== 'ready') {
    return (
      <PageShell className="pb-24">
        <div className="mx-auto max-w-lg px-4 pt-8">
          <SessionFixtureBanner name={fixtureName} />
          <SessionStatePanel state={state} />
        </div>
      </PageShell>
    )
  }

  const saved = state.view
  if (!saved.diagnosis) {
    return (
      <PageShell className="pb-24">
        <div className="mx-auto max-w-lg px-4 pt-8">
          <SessionFixtureBanner name={fixtureName} />
          <LegacySessionPanel sessionId={saved.id} isFixture={isFixture} />
        </div>
      </PageShell>
    )
  }

  const d = saved.diagnosis
  // Same rule as a fresh result: the most severe of the stored risk decision and the
  // S05 text screen. A stored blocked result can therefore never show as lower.
  const safetyVerdict = screenDiagnosisText(saved.description, d)
  const decision = combinedDecision(decideFromDiagnosis(d, null), safetyVerdict)
  const blocked = isBlocked(decision)
  const view = buildDiagnosisView(d, null)
  const lowConfidence = d.confidence < CONFIDENCE_THRESHOLD
  // Same V05 gate as every other page. A saved row carries no approved template, so this
  // is false for live data and the saved result offers no guide entry.
  const savedGuideAvailable = isGuideAvailable(null, { diagnosis: d, decision })

  return (
    <PageShell className="pb-24">
      <div className="mx-auto max-w-lg px-4 pt-8">
        <SessionFixtureBanner name={fixtureName} />
        <h1 className="text-heading-lg mb-8">{t('diagnosis.title')}</h1>

        {(decision === 'professional' || decision === 'emergency') && (
          <SafetyBlockedPanel decision={decision} issueName={d.issueName} analysisDetails={view.analysisDetails} />
        )}

        {lowConfidence && !blocked && (
          <div className="mb-6">
            {/* No approved guide exists, so there is no "continue" action here. */}
            <FallbackMode />
          </div>
        )}

        {!saved.hasStoredPhoto && <MissingPhotoNotice description={saved.description} isFixture={isFixture} />}

        <DiagnosisSections
          diagnosis={d}
          description={saved.description}
          view={view}
          decision={decision}
          safetyVerdict={safetyVerdict}
        />

        <WhyThisResult text={d.explanation || d.summary} />

        {!blocked && (
          <>
            {isFixture || !savedGuideAvailable ? (
              // No approved guide (and dev session fixtures are not real rows): say so plainly.
              <div className="mb-4 rounded-xl border border-border bg-surface p-4">
                <p className="font-semibold text-text-primary">{t('guide.unavailableTitle')}</p>
                <p className="mt-1 text-sm text-text-secondary">{t('guide.unavailableBody')}</p>
              </div>
            ) : (
              // Only reachable once an approved template exists for this result.
              <button
                type="button"
                disabled={!user}
                onClick={() => {
                  if (user && seedRepairCache(saved, user.id)) {
                    navigate(saved.currentStep > 0 ? '/guide' : '/tools')
                  }
                }}
                className="mb-3 min-h-11 w-full rounded-xl bg-primary py-3 font-semibold text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
              >
                {saved.currentStep > 0 ? t('history.continue') : t('diagnosis.ctaTools')}
              </button>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/capture"
                className="flex-1 min-h-11 text-center rounded-xl border border-border py-3 text-text-secondary focus-visible:outline-2 focus-visible:outline-primary"
              >
                {t('diagnosis.ctaRetake')}
              </Link>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/nearby-shops?appliance=${encodeURIComponent(d.issueName)}`)}
              className="mt-3 min-h-11 w-full rounded-xl border border-primary/50 py-3 font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
            >
              {t('nearby.findShops')}
            </button>
          </>
        )}

        <Link
          to="/history"
          className="mt-6 inline-flex min-h-11 items-center text-sm text-text-secondary underline hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          {t('session.backToHistory')}
        </Link>
      </div>
    </PageShell>
  )
}

/** With ?session (or a session fixture) the page loads from the database; otherwise a fresh analysis. */
export default function Diagnosis() {
  return useSessionMode() ? <SavedDiagnosis /> : <FreshDiagnosis />
}
