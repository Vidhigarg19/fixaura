import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pause, Play, CheckCircle2 } from 'lucide-react'
import PageShell from '../components/PageShell'
import StepTimeline from '../components/StepTimeline'
import VoiceInput from '../components/VoiceInput'
import SafetyBubble from '../components/SafetyBubble'
import SafetyBlockedPanel from '../components/SafetyBlockedPanel'
import GuideUnavailablePanel from '../components/GuideUnavailablePanel'
import { useAssistantContext } from '../components/assistantContext'
import { saveSession } from '../services/repairSession'
import { assistantContextFromSession } from '../services/assistantService'
import { saveCompletedRepairStep } from '../services/repairStepProgress'
import { buildRepairPlan } from '../services/repairPlanner'
import { commitCurrentStep } from '../services/repairSessionDb'
import { getLocale, localizedErrorMessage, subscribeLocale, t } from '../i18n'
import { buildDiagnosisView } from '../utils/diagnosisView'
import { isBlocked } from '../utils/riskDecision'
import { getGuideAvailability, guideUnavailableReasonKey } from '../utils/guideAvailability'
import { useDiagnosisSource } from '../utils/useDiagnosisSource'
import { useResolvedMedia } from '../utils/useResolvedMedia'
import { useRepairPhoto } from '../utils/useRepairPhoto'
import RepairPhoto from '../components/RepairPhoto'
import { SessionRepairGate } from '../components/SessionPanels'
import { useSessionMode } from '../utils/useSessionLoader'

// DEV-ONLY banner. In a production build this is `null` and the import is removed.

function FreshRepairGuide() {
  useSyncExternalStore(subscribeLocale, getLocale)
  const navigate = useNavigate()
  const source = useDiagnosisSource()
  const session = source.session
  const { setRepairContext } = useAssistantContext()
  // Safety check on mount: a blocked session never gets steps, even if /guide is typed in.
  const gateView = useMemo(
    () =>
      session?.diagnosis
        ? withTextScreen(
            buildDiagnosisView(session.diagnosis, source.extras),
            session.diagnosis,
            session.description
          )
        : null,
    [session, source.extras]
  )
  const blocked = gateView !== null && isBlocked(gateView.decision)
  // Steps render for a non-blocked result that has a reviewed approved template or
  // validated issue-specific steps. A genuine hazard (blocked) never gets a guide.
  const guideAvail = getGuideAvailability(source.extras, {
    allowFixtureTemplates: source.isFixture,
    diagnosis: session?.diagnosis ?? null,
    decision: gateView?.decision,
  })
  const guideAvailable = guideAvail.status === 'available'
  // Tell the user where non-approved steps came from; approved templates need no notice.
  const guideNoticeKey =
    guideAvail.status === 'available' && guideAvail.source === 'ai_generated'
      ? 'guide.aiGeneratedNotice'
      : guideAvail.status === 'available' && guideAvail.source === 'fallback'
        ? 'guide.fallbackNotice'
        : null
  const steps = useMemo(
    () =>
      blocked || !guideAvailable
        ? []
        : session?.steps?.length
          ? session.steps
          : session?.diagnosis
            ? buildRepairPlan(session.diagnosis)
            : [],
    [blocked, guideAvailable, session]
  )
  const [index, setIndex] = useState(session?.currentStep ?? 0)
  const [paused, setPaused] = useState(false)
  const [safetyOpen, setSafetyOpen] = useState(false)
  const [safetyConfirmed, setSafetyConfirmed] = useState<Record<string, boolean>>({})
  const [savingProgress, setSavingProgress] = useState(false)
  const [progressError, setProgressError] = useState('')
  const saveInFlight = useRef(false)

  const step = steps[index]
  const total = steps.length

  // The picture at the top. Generated steps have no image of their own, so this is the
  // user's main repair photo; a step image (reviewed templates only) is shown when present
  // and falls back to the main photo if it is missing or broken.
  const stepMedia = useResolvedMedia(step?.mediaUrl)
  const sessionMedia = useRepairPhoto(session)

  useEffect(() => {
    // Unapproved steps are never handed to the assistant either.
    if (blocked || !guideAvailable) return
    setRepairContext(assistantContextFromSession(
      session?.diagnosis,
      session?.description ?? '',
      steps,
      index,
      session?.historySessionId
    ))
  }, [blocked, guideAvailable, session, steps, index, setRepairContext])

  useEffect(() => {
    if (source.status === 'missing') navigate('/capture')
  }, [source.status, navigate])

  const canAdvance = useCallback(() => {
    if (!step) return false
    if (step.requiresConfirmation && !safetyConfirmed[step.id]) return false
    return true
  }, [step, safetyConfirmed])

  const moveTo = (nextIndex: number) => {
    setIndex(nextIndex)
    setRepairContext(assistantContextFromSession(
      session?.diagnosis,
      session?.description ?? '',
      steps,
      nextIndex,
      session?.historySessionId
    ))
    setProgressError('')
    // Fixture mode never writes progress anywhere.
    if (source.isFixture) return
    // sessionStorage is only a cache; the DB row is authoritative. Write the
    // cache immediately for a responsive UI, then commit current_step to the
    // single source-of-truth repair_sessions row.
    saveSession({ currentStep: nextIndex })
    const repairSessionId = session?.diagnosisPersistence?.repairSessionId
    if (repairSessionId) {
      void commitCurrentStep(repairSessionId, nextIndex).catch((error: unknown) => {
        setProgressError(localizedErrorMessage(error, 'history.progressError'))
      })
    }
  }

  const next = async () => {
    if (blocked || !step || saveInFlight.current) return
    if (step.requiresConfirmation && !safetyConfirmed[step.id]) {
      setSafetyOpen(true)
      return
    }
    if (source.isFixture) {
      // Fixture mode only moves through the steps; nothing is saved and /verify is not opened.
      if (index < total - 1) moveTo(index + 1)
      return
    }

    saveInFlight.current = true
    setSavingProgress(true)
    setProgressError('')

    try {
      await saveCompletedRepairStep(session?.diagnosisPersistence?.repairSessionId, step.id)

      if (index < total - 1) {
        moveTo(index + 1)
      } else {
        saveSession({ currentStep: total - 1 })
        navigate('/verify')
      }
    } catch (error) {
      setProgressError(localizedErrorMessage(error, 'guide.progressSaveError'))
    } finally {
      saveInFlight.current = false
      setSavingProgress(false)
    }
  }

  const prev = () => {
    if (index > 0) moveTo(index - 1)
  }

  const handleVoice = (text: string) => {
    if (text.includes('next')) void next()
    else if (text.includes('back') || text.includes('previous')) prev()
    else if (text.includes('repeat')) moveTo(index)
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

  if (session?.diagnosis && gateView && (gateView.decision === 'professional' || gateView.decision === 'emergency')) {
    return (
      <PageShell className="pb-24">
        <div className="mx-auto max-w-lg px-4 pt-8">
          <SafetyBlockedPanel
            decision={gateView.decision}
            issueName={session.diagnosis.issueName}
            analysisDetails={gateView.analysisDetails}
            showToolsLocked
          />
        </div>
      </PageShell>
    )
  }

  if (!session?.diagnosis) {
    return (
      <PageShell className="flex items-center justify-center">
        <p className="shimmer-loading px-6 py-3 rounded-xl">{t('guide.loading')}</p>
      </PageShell>
    )
  }

  // Fail closed: no approved checklist or step-by-step guide exists for any result.
  // The voice control, step overlay and step text below are never mounted.
  if (!guideAvailable || !step) {
    return (
      <PageShell className="pb-24">
        <div className="mx-auto max-w-lg px-4 pt-8">
          {source.isFixture && (
            <FixtureBannerSlot name={new URLSearchParams(window.location.search).get('fixture') ?? ''} />
          )}
          <GuideUnavailablePanel
            issueName={session.diagnosis.issueName}
            reasonKey={
              guideAvail.status === 'unavailable'
                ? guideUnavailableReasonKey(guideAvail.reason)
                : undefined
            }
          />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell className="flex flex-col pb-28">
      <StepTimeline total={total} current={index} />
      {guideNoticeKey && (
        <p
          role="note"
          className="mx-auto mt-3 max-w-lg rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-secondary"
        >
          {t(guideNoticeKey)}
        </p>
      )}
      {savingProgress && (
        <p role="status" className="mx-auto mt-3 px-4 text-sm text-text-secondary">
          {index === total - 1 ? t('guide.completionSaving') : t('guide.progressSaving')}
        </p>
      )}
      {progressError && (
        <p role="alert" className="mx-auto mt-3 px-4 text-sm text-error">
          {progressError}
        </p>
      )}

      <div className="relative mx-auto w-full max-w-lg flex-1 px-4 pt-6">
        {source.isFixture && (
          <FixtureBannerSlot name={new URLSearchParams(window.location.search).get('fixture') ?? ''} />
        )}
        {progressError && (
          <p role="alert" className="mb-4 rounded-lg border border-warning/40 p-3 text-sm text-warning">
            {progressError}
          </p>
        )}
        <div className="flex items-center justify-between mb-4 text-sm text-text-subtle">
          <span>
            {t('guide.step')} {index + 1} {t('guide.of')} {total}
          </span>
          <VoiceInput onCommand={handleVoice} />
        </div>

        {/* The user's own photo, clean: no AR marks, scan lines or gradient on top. */}
        <RepairPhoto stepMedia={stepMedia} sessionMedia={sessionMedia} className="mb-6" />

        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35 }}
            className={`glass-panel rounded-xl p-6 ${index === 0 ? '' : ''}`}
          >
            <span className="inline-block text-label-bold text-primary mb-2">
              {t('guide.step')} {index + 1}
            </span>
            <h2 className="text-heading-md mb-3">{step.title}</h2>
            <p className="text-body-md text-text-secondary mb-4">{step.instruction}</p>
            <p className="text-sm text-warning/90 border-l-2 border-warning pl-3">
              {step.safetyNote}
            </p>
          </motion.div>
        </AnimatePresence>

      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 glass-panel border-t border-border px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg flex items-center gap-3">
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={prev}
            disabled={index === 0 || savingProgress}
            className="rounded-xl border border-border p-3 disabled:opacity-30"
            aria-label={t('guide.previous')}
          >
            <ChevronLeft />
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setPaused(!paused)}
            disabled={savingProgress}
            className="rounded-xl border border-border p-3 disabled:opacity-50"
            aria-label={paused ? t('guide.resume') : t('guide.pause')}
          >
            {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => void next()}
            disabled={paused || savingProgress}
            className="flex-1 rounded-xl bg-primary py-3 font-semibold text-background disabled:opacity-50"
          >
            {index < total - 1 ? t('guide.next') : t('guide.confirmStep')}
          </motion.button>

          {index < total - 1 ? (
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => void next()}
              disabled={!canAdvance() || paused || savingProgress}
              className="rounded-xl border border-border p-3"
              aria-label={t('guide.next')}
            >
              <ChevronRight />
            </motion.button>
          ) : (
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => void next()}
              disabled={savingProgress}
              className="rounded-xl bg-success/20 border border-success/40 p-3"
              aria-label={t('guide.confirmStep')}
            >
              <CheckCircle2 className="h-5 w-5 text-success" />
            </motion.button>
          )}
        </div>
      </div>

      <SafetyBubble
        open={safetyOpen}
        message={step.safetyNote}
        onConfirm={() => {
          setSafetyConfirmed((s) => ({ ...s, [step.id]: true }))
          setSafetyOpen(false)
        }}
        onCancel={() => setSafetyOpen(false)}
      />
    </PageShell>
  )
}

/**
 * /guide?session=<id> loads the saved session first and never renders steps from
 * the browser cache. Step restore and progress saving are deferred (no approved steps).
 */
export default function RepairGuide() {
  return useSessionMode() ? <SessionRepairGate /> : <FreshRepairGuide />
}
