import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pause, Play, CheckCircle2 } from 'lucide-react'
import PageShell from '../components/PageShell'
import StepTimeline from '../components/StepTimeline'
import AROverlay from '../components/AROverlay'
import VoiceInput from '../components/VoiceInput'
import SafetyBubble from '../components/SafetyBubble'
import FollowUpChat from '../components/FollowUpChat'
import { estimateSavings, getSession, saveSession } from '../services/repairSession'
import { saveCompletedRepairStep } from '../services/repairStepProgress'
import { persistCompletedRepair } from '../services/completedRepair'
import { buildRepairPlan } from '../services/repairPlanner'
import { completeSession, updateProgress } from '../services/historyService'
import { t } from '../i18n'

export default function RepairGuide() {
  const navigate = useNavigate()
  const session = getSession()
  const steps = useMemo(
    () => session?.steps ?? (session?.diagnosis ? buildRepairPlan(session.diagnosis) : []),
    [session?.diagnosis, session?.steps]
  )
  const [index, setIndex] = useState(session?.currentStep ?? 0)
  const [paused, setPaused] = useState(false)
  const [safetyOpen, setSafetyOpen] = useState(false)
  const [safetyConfirmed, setSafetyConfirmed] = useState<Record<string, boolean>>({})
  const [savingProgress, setSavingProgress] = useState(false)
  const [progressError, setProgressError] = useState('')
  const [completionError, setCompletionError] = useState('')
  const saveInFlight = useRef(false)

  const step = steps[index]
  const total = steps.length

  useEffect(() => {
    if (!session?.diagnosis) navigate('/capture')
  }, [session, navigate])

  const canAdvance = useCallback(() => {
    if (!step) return false
    if (step.requiresConfirmation && !safetyConfirmed[step.id]) return false
    return true
  }, [step, safetyConfirmed])

  const moveTo = (nextIndex: number) => {
    setIndex(nextIndex)
    saveSession({ currentStep: nextIndex })
    setProgressError('')
    if (session?.historySessionId) {
      void updateProgress(session.historySessionId, nextIndex).catch((error: unknown) => {
        setProgressError(error instanceof Error ? error.message : t('history.progressError'))
      })
    }
  }

  const finish = async () => {
    if (!session?.diagnosis) return
    setCompletionError('')
    try {
      const completedRepair = await persistCompletedRepair(
        session.diagnosisPersistence?.repairSessionId,
        session.diagnosisPersistence?.diagnosisId
      )
      if (session.historySessionId) await completeSession(session.historySessionId)
      const savings = estimateSavings(session.diagnosis)
      saveSession({
        completedRepair,
        ...savings,
        completedAt: completedRepair.completedAt,
      })
      navigate('/completed')
    } catch (error) {
      setCompletionError(
        error instanceof Error ? error.message : t('completion.saveError')
      )
    }
  }

  const next = async () => {
    if (!step || saveInFlight.current) return
    if (step.requiresConfirmation && !safetyConfirmed[step.id]) {
      setSafetyOpen(true)
      return
    }

    saveInFlight.current = true
    setSavingProgress(true)
    setProgressError('')
    setCompletionError('')

    try {
      await saveCompletedRepairStep(session?.diagnosisPersistence?.repairSessionId, step.id)

      if (index < total - 1) {
        moveTo(index + 1)
      } else {
        await finish()
      }
    } catch (error) {
      setProgressError(
        error instanceof Error ? error.message : t('guide.progressSaveError')
      )
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

  if (!session?.diagnosis || !step) {
    return (
      <PageShell className="flex items-center justify-center">
        <p className="shimmer-loading px-6 py-3 rounded-xl">{t('guide.loading')}</p>
      </PageShell>
    )
  }

  return (
    <PageShell className="flex flex-col pb-28">
      <StepTimeline total={total} current={index} />
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
      {completionError && (
        <p role="alert" className="mx-auto mt-3 px-4 text-sm text-error">
          {completionError}
        </p>
      )}

      <div className="relative mx-auto w-full max-w-lg flex-1 px-4 pt-6">
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

        <div className="relative aspect-video rounded-xl bg-surface-high overflow-hidden mb-6">
          {session.imageDataUrl && (
            <img
              src={session.imageDataUrl}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover opacity-40"
            />
          )}
          <AROverlay variant="guide" visualCue={step.visualCue} />
          <motion.div
            key={step.id}
            className="absolute inset-0 flex items-end p-4 bg-gradient-to-t from-background/90 to-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: paused ? 0.6 : 1 }}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35 }}
            className={`glass-panel rounded-xl p-6 ${index === 0 ? '' : ''}`}
          >
            <motion.span
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="inline-block text-label-bold text-primary mb-2"
            >
              {t('guide.step')} {index + 1}
            </motion.span>
            <h2 className="text-heading-md mb-3">{step.title}</h2>
            <p className="text-body-md text-text-secondary mb-4">{step.instruction}</p>
            <p className="text-sm text-warning/90 border-l-2 border-warning pl-3">
              {step.safetyNote}
            </p>
          </motion.div>
        </AnimatePresence>

        {session.diagnosis && <FollowUpChat
          sessionId={session.historySessionId}
          diagnosis={session.diagnosis}
          step={step}
        />}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 glass-panel border-t border-border px-4 py-4">
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
