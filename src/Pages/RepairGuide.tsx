import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import PageShell from '../components/PageShell'
import StepTimeline from '../components/StepTimeline'
import AROverlay from '../components/AROverlay'
import VoiceInput from '../components/VoiceInput'
import SafetyBubble from '../components/SafetyBubble'
import { getSession, saveSession, estimateSavings } from '../services/repairSession'
import { buildRepairPlan } from '../services/repairPlanner'
import { t } from '../i18n'

export default function RepairGuide() {
  const navigate = useNavigate()
  const session = getSession()
  const steps = useMemo(
    () => (session?.diagnosis ? buildRepairPlan(session.diagnosis) : []),
    [session?.diagnosis]
  )
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [safetyOpen, setSafetyOpen] = useState(false)
  const [safetyConfirmed, setSafetyConfirmed] = useState<Record<string, boolean>>({})

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

  const next = () => {
    if (!step) return
    if (step.requiresConfirmation && !safetyConfirmed[step.id]) {
      setSafetyOpen(true)
      return
    }
    if (index < total - 1) setIndex((i) => i + 1)
    else finish()
  }

  const prev = () => {
    if (index > 0) setIndex((i) => i - 1)
  }

  const finish = () => {
    if (!session?.diagnosis) return
    const savings = estimateSavings(session.diagnosis)
    saveSession({ ...savings, completedAt: new Date().toISOString() })
    navigate('/done')
  }

  const handleVoice = (text: string) => {
    if (text.includes('next')) next()
    else if (text.includes('back') || text.includes('previous')) prev()
    else if (text.includes('repeat')) setIndex(index)
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

      <div className="relative mx-auto w-full max-w-lg flex-1 px-4 pt-6">
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
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 glass-panel border-t border-border px-4 py-4">
        <div className="mx-auto max-w-lg flex items-center gap-3">
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={prev}
            disabled={index === 0}
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
            className="rounded-xl border border-border p-3"
            aria-label={paused ? t('guide.resume') : t('guide.pause')}
          >
            {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={next}
            disabled={paused}
            className="flex-1 rounded-xl bg-primary py-3 font-semibold text-background disabled:opacity-50"
          >
            {index < total - 1 ? t('guide.next') : t('guide.confirmStep')}
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={next}
            disabled={!canAdvance() || paused}
            className="rounded-xl border border-border p-3"
            aria-label={t('guide.next')}
          >
            <ChevronRight />
          </motion.button>
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
