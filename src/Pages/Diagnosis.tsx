import { motion } from 'framer-motion'
import { Suspense, lazy, useState, useEffect, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react'
import PageShell from '../components/PageShell'
import FallbackMode from '../components/FallbackMode'
import SafetyBlockedPanel from '../components/SafetyBlockedPanel'
import SafetyDisclaimer from '../components/SafetyDisclaimer'
import FollowUpQuestions from '../components/FollowUpQuestions'
import { isValidDiagnosisSession, saveSession } from '../services/repairSession'
import { buildRepairPlan } from '../services/repairPlanner'
import { getLocale, subscribeLocale, t } from '../i18n'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/authContext'
import { buildDiagnosisView } from '../utils/diagnosisView'
import { useDiagnosisSource } from '../utils/useDiagnosisSource'
import { withFixtureQuery } from '../utils/fixtureGate'
import { decideFromDiagnosis, isBlocked, type RiskDecision } from '../utils/riskDecision'
import { screenFields } from '../lib/safety'
import { isGuideAvailable } from '../utils/guideAvailability'
import type { FollowUpResult } from '../services/followUpClient'

// DEV-ONLY banner. In a production build this is `null` and the import is removed.
const FixtureBanner = import.meta.env.DEV ? lazy(() => import('../dev/FixtureBanner')) : null

const CONFIDENCE_THRESHOLD = 70
const diagnosisSaveOperations = new Map<string, Promise<void>>()

function saveDiagnosisOnce(attemptId: string, save: () => Promise<void>) {
  const existingOperation = diagnosisSaveOperations.get(attemptId)
  if (existingOperation) return existingOperation

  const operation = save().finally(() => {
    if (diagnosisSaveOperations.get(attemptId) === operation) {
      diagnosisSaveOperations.delete(attemptId)
    }
  })
  diagnosisSaveOperations.set(attemptId, operation)
  return operation
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

export default function Diagnosis() {
  useSyncExternalStore(subscribeLocale, getLocale)
  const navigate = useNavigate()
  const { user } = useAuth()
  const source = useDiagnosisSource()
  // Initial session only: the persistence effect below must not re-run when a follow-up
  // result changes what is displayed.
  const [session] = useState(() => source.session)
  const liveSession = source.session
  // Most severe decision available from the server data. No session means unknown,
  // which is treated as the safer side.
  const decision: RiskDecision = liveSession
    ? decideFromDiagnosis(liveSession.diagnosis, source.extras)
    : 'professional'
  const blocked = isBlocked(decision)
  // No approved checklist or guide exists yet. The diagnosis itself is still saved
  // by the effect below; only the guided-repair start is closed.
  const guideAvailable = isGuideAvailable()
  const [expanded, setExpanded] = useState(false)
  const [saveStatus, setSaveStatus] = useState('Saving diagnosis...')
  const [repairSessionReady, setRepairSessionReady] = useState(false)
  const [starting, setStarting] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function saveDiagnosis() {
      if (!isValidDiagnosisSession(session, user?.id)) return
      const attemptId = session.diagnosisAttemptId || crypto.randomUUID()
      if (!session.diagnosisAttemptId) {
        saveSession({ diagnosisAttemptId: attemptId })
      }

      try {
        await saveDiagnosisOnce(attemptId, async () => {
          const {
            data: { user },
            error: authError,
          } = await supabase.auth.getUser()

          if (authError) throw authError
          if (!user) throw new Error('Please log in to save your diagnosis.')

          const d = session.diagnosis
          const issueLabel = d.issueName.trim()
          if (!issueLabel) throw new Error(t('diagnosis.issueNameMissing'))

          let persistence =
            session.diagnosisPersistence?.userId === user.id
              ? { ...session.diagnosisPersistence }
              : { userId: user.id }
          saveSession({ diagnosisAttemptId: attemptId, diagnosisPersistence: persistence })

          let applianceId = persistence.applianceId
          if (applianceId) {
            const { data: appliance, error } = await supabase
              .from('appliances')
              .select('id')
              .eq('id', applianceId)
              .eq('user_id', user.id)
              .maybeSingle()

            if (error) throw error
            if (!appliance) throw new Error('The saved appliance could not be verified.')
          } else {
            const { data: matchingAppliances, error: findApplianceError } =
              await supabase
                .from('appliances')
                .select('id')
                .eq('user_id', user.id)
                .eq('name', issueLabel)
                .eq('appliance_type', issueLabel)
                .limit(2)

            if (findApplianceError) throw findApplianceError
            if (matchingAppliances.length > 1) {
              throw new Error(
                'Multiple appliances match this name. Resolve the duplicate appliances before saving this diagnosis.'
              )
            }

            if (matchingAppliances.length === 1) {
              applianceId = matchingAppliances[0].id
            } else {
              const { data: newAppliance, error: createApplianceError } =
                await supabase
                  .from('appliances')
                  .insert({
                    user_id: user.id,
                    name: issueLabel,
                    appliance_type: issueLabel,
                  })
                  .select('id')
                  .single()

              if (createApplianceError) throw createApplianceError
              applianceId = newAppliance.id
            }

            persistence = { ...persistence, applianceId }
            saveSession({ diagnosisAttemptId: attemptId, diagnosisPersistence: persistence })
          }

          let diagnosisId = persistence.diagnosisId
          if (diagnosisId) {
            const { data: diagnosis, error } = await supabase
              .from('diagnoses')
              .select('id')
              .eq('id', diagnosisId)
              .eq('user_id', user.id)
              .maybeSingle()

            if (error) throw error
            if (!diagnosis) diagnosisId = undefined
          }

          if (!diagnosisId) {
            const { data: diagnosisRow, error: diagnosisError } = await supabase
              .from('diagnoses')
              .insert({
                user_id: user.id,
                appliance_type: issueLabel,
                issue_title: d.issueName,
                diagnosis_result: d,
              })
              .select('id')
              .single()

            if (diagnosisError) throw diagnosisError
            diagnosisId = diagnosisRow.id
            persistence = { ...persistence, diagnosisId }
            saveSession({ diagnosisAttemptId: attemptId, diagnosisPersistence: persistence })
          }

          const { data: existingSessions, error: findSessionError } = await supabase
            .from('repair_sessions')
            .select('id, appliance_id')
            .eq('user_id', user.id)
            .eq('diagnosis_id', diagnosisId)
            .limit(2)

          if (findSessionError) throw findSessionError
          if (existingSessions.length > 1) {
            throw new Error('Multiple repair sessions already exist for this diagnosis.')
          }

          // S06: the repair_sessions row is the single source of truth, so it
          // carries the full payload (diagnosis/steps/issue_name/current_step)
          // from creation — not just the appliance/diagnosis links. This is the
          // same row later used for step progress, completion, AND reload
          // rehydration, so there is exactly one row per repair.
          const steps = buildRepairPlan(d)
          const authoritativeFields = {
            title: d.issueName,
            issue_name: d.issueName,
            description: session.description,
            diagnosis: d,
            steps,
            current_step: 0,
          }

          const existingSession = existingSessions[0]
          if (existingSession) {
            if (existingSession.appliance_id === null) {
              throw new Error(
                'An existing repair session is missing its appliance link. It was left unchanged; review it in Supabase before retrying.'
              )
            } else if (existingSession.appliance_id !== applianceId) {
              throw new Error('The repair session is linked to a different appliance.')
            }
            // Backfill the authoritative payload on a pre-S06 row that may only
            // have the links. Never downgrade a completed row back to in_progress.
            const { error: backfillError } = await supabase
              .from('repair_sessions')
              .update(authoritativeFields)
              .eq('id', existingSession.id)
              .eq('user_id', user.id)
              .eq('status', 'in_progress')
            if (backfillError) throw backfillError
            persistence = { ...persistence, repairSessionId: existingSession.id }
            saveSession({
              diagnosisAttemptId: attemptId,
              diagnosisPersistence: persistence,
              historySessionId: existingSession.id,
              steps,
              currentStep: 0,
            })
          } else {
            const { data: createdSession, error: createSessionError } = await supabase
              .from('repair_sessions')
              .insert({
                user_id: user.id,
                appliance_id: applianceId,
                diagnosis_id: diagnosisId,
                status: 'in_progress',
                ...authoritativeFields,
              })
              .select('id, user_id, diagnosis_id, appliance_id')
              .single()

            if (createSessionError) throw createSessionError
            if (
              createdSession.user_id !== user.id ||
              createdSession.diagnosis_id !== diagnosisId ||
              createdSession.appliance_id !== applianceId
            ) {
              throw new Error('The repair session was not saved with the expected links.')
            }
            persistence = { ...persistence, repairSessionId: createdSession.id }
            saveSession({
              diagnosisAttemptId: attemptId,
              diagnosisPersistence: persistence,
              historySessionId: createdSession.id,
              steps,
              currentStep: 0,
            })
          }
        })

        if (!cancelled) {
          setRepairSessionReady(true)
          setSaveStatus('Diagnosis and repair session saved successfully.')
        }
      } catch (error) {
        console.error('Diagnosis save failed:', error)

        if (!cancelled) {
          setSaveStatus(
            error instanceof Error
              ? `Could not save diagnosis: ${error.message}`
              : 'Could not save diagnosis.'
          )
        }
      }
    }

    void saveDiagnosis()

    return () => {
      cancelled = true
    }
  }, [session, user?.id])

  const startRepair = async () => {
    if (!liveSession || starting) return
    if (isBlocked(decision)) return
    // Never build or save frontend-generated steps as a guide.
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
    // S06: the authoritative repair_sessions row (with diagnosis + steps) was
    // already created/backfilled by the save effect. We no longer create a
    // second "history" row here; the single row IS the history row. Just make
    // sure the local cache has the steps and the session id before navigating.
    try {
      const steps = liveSession.steps?.length
        ? liveSession.steps
        : buildRepairPlan(liveSession.diagnosis)
      saveSession({
        historySessionId: repairSessionId,
        steps,
        currentStep: liveSession.currentStep ?? 0,
      })
      navigate('/tools')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('history.saveError'))
    } finally {
      setStarting(false)
    }
  }

  const handleFollowUpResult = (result: FollowUpResult) => {
    // A blocked session is never changed by a later response; applyUpdate enforces that.
    source.applyUpdate({ diagnosis: result.diagnosis, extras: result.extras })
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
    : isValidDiagnosisSession(liveSession, user?.id)
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
  const risk = RISK_STYLE[decision]
  const evidence = EVIDENCE_KEYS[view.evidence]
  const showFollowUps = !blocked && view.followUps.length > 0 && view.sessionId !== null
  const sectionClass = 'glass-panel rounded-xl p-6 mb-6'
  // S05: client-side screen of what is actually shown. Blocked content is handled
  // by SafetyBlockedPanel; this verdict drives the non-blocking disclaimer banner
  // for caution-level findings and the always-on AI disclaimer below.
  const safetyVerdict = screenFields([
    liveSession.description,
    d.issueName,
    d.summary,
    d.recommendedFix,
    d.safetyWarning,
    ...(d.recommendedTools ?? []),
  ])

  return (
    <PageShell className="pb-24">
      <div className="mx-auto max-w-lg px-4 pt-8">
        {FixtureBanner && source.isFixture && (
          <Suspense fallback={null}>
            <FixtureBanner name={new URLSearchParams(window.location.search).get('fixture') ?? ''} />
          </Suspense>
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
            {saveStatus}
          </p>
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

        <div className={sectionClass}>
          <p className="text-label-bold text-text-subtle mb-1">{t('diagnosis.yourDescription')}</p>
          <p className="text-body-md text-text-secondary">{liveSession.description}</p>
          <p className="text-label-bold text-text-subtle mb-1 mt-5">{t('diagnosis.detectedIssue')}</p>
          <p className="text-heading-md">{d.issueName}</p>
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
            <p className="text-body-md text-text-secondary">{d.recommendedFix}</p>
          </section>
        )}

        {showFollowUps && view.sessionId && (
          <FollowUpQuestions
            key={`${view.sessionId}:${view.followUps.map((question) => question.id).join(',')}`}
            questions={view.followUps}
            sessionId={view.sessionId}
            onResult={handleFollowUpResult}
          />
        )}

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
            {d.explanation || d.summary}
          </motion.p>
        )}

        {!blocked && (
          <>
            {!guideAvailable && (
              <div className="mb-4 rounded-xl border border-border bg-surface p-4">
                <p className="font-semibold text-text-primary">{t('guide.unavailableTitle')}</p>
                <p className="mt-1 text-sm text-text-secondary">{t('guide.unavailableBody')}</p>
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
        {saveError && <p role="alert" className="mt-4 text-sm text-warning">{saveError}</p>}
      </div>
    </PageShell>
  )
}