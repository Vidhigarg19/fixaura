import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import PageShell from '../components/PageShell'
import PhotoCapture from '../components/PhotoCapture'
import { getLocale, subscribeLocale, t } from '../i18n'
import { getSession, saveSession, estimateSavings } from '../services/repairSession'
import { buildRepairPlan } from '../services/repairPlanner'
import { verifyRepair } from '../services/visionAI'
import { completeSession } from '../services/historyService'
import { persistCompletedRepair } from '../services/completedRepair'
import type { CapturedPhoto } from '../services/photoImage'
import type { DiagnosisResult, RepairVerification, VerificationStatus } from '../types/repair'

export default function Verify() {
  const navigate = useNavigate()
  const locale = useSyncExternalStore(subscribeLocale, getLocale)
  const session = useMemo(() => getSession(), [])

  const [afterPhoto, setAfterPhoto] = useState<CapturedPhoto | null>(null)
  const [note, setNote] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [completionError, setCompletionError] = useState('')
  const [result, setResult] = useState<RepairVerification | null>(
    () => session?.diagnosis?.verification ?? null
  )

  useEffect(() => {
    if (!session?.diagnosis) {
      navigate('/capture', { replace: true })
    }
  }, [session, navigate])

  const stepsSummary = useMemo(() => {
    if (!session?.diagnosis) return ''
    const steps = session.steps ?? buildRepairPlan(session.diagnosis)
    return steps.map((s, idx) => `${idx + 1}. ${s.title}`).join('; ')
  }, [session])

  const handleVerify = async () => {
    if (!session?.diagnosis) return
    if (!afterPhoto) {
      setVerifyError(t('verify.photoRequired'))
      return
    }

    setVerifying(true)
    setVerifyError('')
    setCompletionError('')

    try {
      const verification = await verifyRepair({
        afterImage: afterPhoto.blob,
        beforeImage: session.imageDataUrl,
        issueName: session.diagnosis.issueName,
        description: session.description ?? '',
        stepsSummary,
        locale,
        note: note.trim() || undefined,
      })
      setResult(verification)
    } catch (error) {
      console.error('Repair verification error:', error)
      setVerifyError(error instanceof Error ? error.message : t('verify.error'))
    } finally {
      setVerifying(false)
    }
  }

  const handleFinish = async (verificationToSave?: RepairVerification) => {
    if (!session?.diagnosis || completing) return
    setCompleting(true)
    setCompletionError('')

    const updatedDiagnosis: DiagnosisResult = {
      ...session.diagnosis,
      ...(verificationToSave ? { verification: verificationToSave } : {}),
    }

    try {
      if (session.historySessionId) {
        try {
          await completeSession(session.historySessionId, updatedDiagnosis)
        } catch (error) {
          console.warn('Unable to complete history session:', error)
        }
      }

      let completedRepairRecord = null
      if (session.diagnosisPersistence?.repairSessionId && session.diagnosisPersistence?.diagnosisId) {
        try {
          completedRepairRecord = await persistCompletedRepair(
            session.diagnosisPersistence.repairSessionId,
            session.diagnosisPersistence.diagnosisId
          )
        } catch (error) {
          console.warn('Completed repair record persistence error:', error)
        }
      }

      if (!completedRepairRecord) {
        completedRepairRecord = {
          id: crypto.randomUUID(),
          diagnosisId: session.diagnosisPersistence?.diagnosisId ?? 'guest-repair',
          repairSummary: updatedDiagnosis.recommendedFix || updatedDiagnosis.issueName,
          completedAt: new Date().toISOString(),
          feedbackRating: null,
        }
      }

      const savings = estimateSavings(updatedDiagnosis)
      saveSession({
        diagnosis: updatedDiagnosis,
        completedRepair: completedRepairRecord,
        ...savings,
        completedAt: completedRepairRecord.completedAt,
      })

      navigate('/completed')
    } catch (error) {
      setCompletionError(
        error instanceof Error ? error.message : t('completion.saveError')
      )
    } finally {
      setCompleting(false)
    }
  }

  const handleSkip = () => {
    void handleFinish(undefined)
  }

  if (!session?.diagnosis) {
    return (
      <PageShell className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label={t('common.loading')} />
      </PageShell>
    )
  }

  const statusConfig: Record<
    VerificationStatus,
    { badgeClass: string; cardClass: string; icon: typeof CheckCircle2; titleKey: string }
  > = {
    resolved: {
      badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/40',
      cardClass: 'border-teal-500/30 bg-teal-500/5',
      icon: CheckCircle2,
      titleKey: 'verify.status.resolved',
    },
    monitor: {
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
      cardClass: 'border-amber-500/30 bg-amber-500/5',
      icon: Clock,
      titleKey: 'verify.status.monitor',
    },
    unresolved: {
      badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
      cardClass: 'border-rose-500/30 bg-rose-500/5',
      icon: AlertOctagon,
      titleKey: 'verify.status.unresolved',
    },
    professional: {
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
      cardClass: 'border-rose-500/40 bg-rose-500/10',
      icon: ShieldAlert,
      titleKey: 'verify.status.professional',
    },
  }

  return (
    <PageShell className="min-h-screen px-4 py-6 sm:py-10">
      <main className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => navigate('/guide')}
          className="mb-4 inline-flex items-center gap-2 rounded-lg text-sm text-text-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('history.back')}
        </button>

        <header className="mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t('verify.title')}
            </span>
          </div>
          <h1 className="mt-2 text-heading-lg text-text-primary">{session.diagnosis.issueName}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t('verify.subtitle')}</p>
        </header>

        {completionError && (
          <div role="alert" className="mb-6 rounded-xl border border-error/50 bg-error/10 p-4">
            <p className="text-sm text-error">{completionError}</p>
          </div>
        )}

        {verifyError && (
          <div role="alert" className="mb-6 rounded-xl border border-warning/50 bg-warning/10 p-4">
            <p className="text-sm text-warning">{verifyError}</p>
            <button
              type="button"
              onClick={() => void handleVerify()}
              className="mt-3 rounded-lg border border-warning/50 px-4 py-1.5 text-xs font-semibold text-warning focus-visible:outline-2 focus-visible:outline-primary"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!result ? (
            <motion.section
              key="capture-area"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Before Photo Card */}
                <div className="glass-panel flex flex-col overflow-hidden rounded-2xl p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
                      {t('verify.beforePhoto')}
                    </span>
                    <span className="rounded-md bg-surface-high px-2 py-0.5 text-xs text-text-subtle">
                      1 / 2
                    </span>
                  </div>

                  <div className="relative aspect-video flex-1 overflow-hidden rounded-xl bg-background/60">
                    {session.imageDataUrl ? (
                      <img
                        src={session.imageDataUrl}
                        alt={t('verify.beforePhotoAlt')}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                        <ImageIcon className="h-8 w-8 text-text-subtle" aria-hidden="true" />
                        <p className="mt-2 text-xs text-text-subtle">{t('verify.beforeMissing')}</p>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-text-secondary truncate">
                    {session.diagnosis.summary || session.diagnosis.issueName}
                  </p>
                </div>

                {/* After Photo Capture Card */}
                <div className="flex flex-col">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                      {t('verify.afterPhoto')}
                    </span>
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      2 / 2
                    </span>
                  </div>
                  <PhotoCapture photo={afterPhoto} onChange={setAfterPhoto} />
                </div>
              </div>

              {/* Note input */}
              <div className="glass-panel space-y-2 rounded-2xl p-4 sm:p-5">
                <label htmlFor="verify-note" className="block text-sm font-medium text-text-primary">
                  {t('verify.notesLabel')}
                </label>
                <textarea
                  id="verify-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 200))}
                  maxLength={200}
                  rows={3}
                  placeholder={t('verify.notesPlaceholder')}
                  className="w-full resize-none rounded-xl border border-border bg-background/80 p-3 text-sm text-text-primary placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-primary"
                />
                <div className="flex justify-end text-xs text-text-subtle">
                  <span>{note.length}/200</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={verifying || completing}
                  className="rounded-xl border border-border px-5 py-3 text-sm font-semibold text-text-secondary hover:text-text-primary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {t('verify.skip')}
                </button>

                <button
                  type="button"
                  onClick={() => void handleVerify()}
                  disabled={!afterPhoto || verifying || completing}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-background shadow-lg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary sm:flex-none"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                      {t('verify.verifying')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5" aria-hidden="true" />
                      {t('verify.submit')}
                    </>
                  )}
                </button>
              </div>
            </motion.section>
          ) : (
            <motion.section
              key="result-card"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
            >
              {/* Main Result Card */}
              <div
                className={`glass-panel rounded-2xl border p-5 sm:p-6 ${
                  statusConfig[result.status].cardClass
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                        statusConfig[result.status].badgeClass
                      }`}
                    >
                      {(() => {
                        const Icon = statusConfig[result.status].icon
                        return <Icon className="h-4 w-4" aria-hidden="true" />
                      })()}
                      {t(statusConfig[result.status].titleKey)}
                    </span>
                  </div>

                  {result.mock && (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {t('verify.demoBadge')}
                    </span>
                  )}
                </div>

                <p className="mt-4 text-base font-medium text-text-primary">{result.summary}</p>

                {/* Visual Checks List */}
                <div className="mt-6 space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
                    {t('verify.checksTitle')}
                  </h2>
                  <ul className="space-y-2" aria-label={t('verify.checksTitle')}>
                    {result.checks.map((check, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-surface/40 p-3 text-sm"
                      >
                        {check.passed ? (
                          <span
                            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-teal-300"
                            aria-label={t('verify.checkPassed')}
                          >
                            <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                          </span>
                        ) : (
                          <span
                            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-300"
                            aria-label={t('verify.checkFailed')}
                          >
                            <AlertTriangle className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                          </span>
                        )}
                        <span
                          className={check.passed ? 'text-text-primary' : 'font-medium text-warning'}
                        >
                          {check.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Next Step Advice */}
                <div className="mt-6 rounded-xl border border-border/70 bg-surface-high/60 p-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
                    {t('verify.nextAdvice')}
                  </span>
                  <p className="mt-1 text-sm text-text-secondary">{result.nextAdvice}</p>
                </div>

                {/* Safety Warning for Professional Inspection */}
                {result.status === 'professional' && (
                  <div
                    role="alert"
                    className="mt-6 rounded-xl border border-error/60 bg-error/15 p-4 text-sm text-error"
                  >
                    <div className="flex items-center gap-2 font-bold">
                      <ShieldAlert className="h-5 w-5 text-error" aria-hidden="true" />
                      <span>{t('verify.status.professional')}</span>
                    </div>
                    <p className="mt-2 text-text-primary/90">{t('verify.safetyMessage')}</p>
                  </div>
                )}
              </div>

              {/* Photos Comparison Preview */}
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-panel overflow-hidden rounded-xl p-2.5 text-center">
                  <span className="text-2xs uppercase tracking-wider text-text-subtle block mb-1">
                    {t('verify.beforePhoto')}
                  </span>
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-background/60">
                    {session.imageDataUrl ? (
                      <img
                        src={session.imageDataUrl}
                        alt={t('verify.beforePhotoAlt')}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-text-subtle">
                        {t('verify.beforeMissing')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="glass-panel overflow-hidden rounded-xl p-2.5 text-center">
                  <span className="text-2xs uppercase tracking-wider text-text-subtle block mb-1">
                    {t('verify.afterPhoto')}
                  </span>
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-background/60">
                    {afterPhoto ? (
                      <img
                        src={afterPhoto.dataUrl}
                        alt={t('verify.afterPhotoAlt')}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-text-subtle">
                        —
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions for Result */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {result.status !== 'professional' && (
                  <button
                    type="button"
                    onClick={() => {
                      setResult(null)
                      setAfterPhoto(null)
                    }}
                    disabled={completing}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {t('verify.reverify')}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleFinish(result)}
                  disabled={completing}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-background shadow-lg hover:brightness-110 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {completing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                      {t('verify.completing')}
                    </>
                  ) : (
                    <>
                      <span>{t('verify.finish')}</span>
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </PageShell>
  )
}
