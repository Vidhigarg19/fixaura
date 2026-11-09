import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, HelpCircle, ImageIcon, Info, Loader2, ShieldAlert, WifiOff } from 'lucide-react'
import PageShell from '../components/PageShell'
import { getLocale, localizedErrorMessage, subscribeLocale, t } from '../i18n'
import { getSession, saveSession } from '../services/repairSession'
import { completeSession } from '../services/historyService'
import { persistCompletedRepair } from '../services/completedRepair'
import type { CapturedPhoto } from '../services/photoImage'
import PhotoCapture from '../components/PhotoCapture'
import { isOffline } from '../utils/networkError'
import {
  canStartComparison,
  comparisonReducer,
  errorMessageKey,
  inputState,
  observationLabelKey,
  stageLabelKey,
  type ComparisonErrorKind,
} from '../utils/comparisonState'

type SymptomsAnswer = 'yes' | 'no' | 'not_sure'

const MAX_SYMPTOM_DETAILS = 200
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

// V07: before/after comparison screen.
// - Both photos are required before a comparison can start.
// - The comparison service does not exist right now (verify mode was removed from
//   analyze-image), so pressing "Compare photos" sends NOTHING and shows an honest
//   "not available" state. No result is invented or saved.
// - Finishing the repair steps is separate from any comparison.
export default function Verify() {
  const navigate = useNavigate()
  useSyncExternalStore(subscribeLocale, getLocale)
  const session = useMemo(() => getSession(), [])
  const hasBefore = typeof session?.imageDataUrl === 'string' && session.imageDataUrl.startsWith('data:image/')

  const [afterPhoto, setAfterPhoto] = useState<CapturedPhoto | null>(null)
  const [comparison, dispatch] = useReducer(comparisonReducer, inputState(hasBefore, false))
  const [symptoms, setSymptoms] = useState<SymptomsAnswer | null>(null)
  const [symptomDetails, setSymptomDetails] = useState('')
  const [completing, setCompleting] = useState(false)
  const [completionError, setCompletionError] = useState('')
  const completionLock = useRef(false)

  useEffect(() => {
    if (!session?.diagnosis) {
      navigate('/capture', { replace: true })
    }
  }, [session, navigate])

  const comparing = comparison.kind === 'comparing'

  const changeAfterPhoto = (photo: CapturedPhoto | null) => {
    setAfterPhoto(photo)
    dispatch({ type: 'inputs', hasBefore, hasAfter: photo !== null })
  }

  const attemptComparison = () => {
    const base = inputState(hasBefore, afterPhoto !== null)
    dispatch({ type: 'inputs', hasBefore, hasAfter: afterPhoto !== null })
    if (!canStartComparison(base)) return
    // No comparison service is available: nothing is sent and no result is recorded.
    const error: ComparisonErrorKind = isOffline() ? 'offline' : 'unavailable'
    dispatch({ type: 'error', error })
  }

  // Finishing the steps is guide completion only. It never saves or implies a comparison.
  const handleFinishSteps = async () => {
    if (!session?.diagnosis || completing || comparing || completionLock.current) return
    completionLock.current = true
    setCompleting(true)
    setCompletionError('')

    try {
      if (session.historySessionId) {
        const completedSession = await completeSession(session.historySessionId)
        if (!completedSession) throw new Error(t('completion.saveError'))
      }

      const repairSessionId = session.diagnosisPersistence?.repairSessionId
      const diagnosisId = session.diagnosisPersistence?.diagnosisId
      if (Boolean(repairSessionId) !== Boolean(diagnosisId)) {
        throw new Error(t('completion.saveError'))
      }
      const completedRepairRecord = repairSessionId && diagnosisId
        ? await persistCompletedRepair(repairSessionId, diagnosisId)
        : {
            id: crypto.randomUUID(),
            // Local-only marker for a guest: nothing was saved to an account.
            diagnosisId: 'guest-repair',
            repairSummary: session.diagnosis.recommendedFix || session.diagnosis.issueName,
            completedAt: new Date().toISOString(),
            feedbackRating: null,
          }

      saveSession({
        completedRepair: completedRepairRecord,
        completedAt: completedRepairRecord.completedAt,
      })

      navigate('/completed')
    } catch (error) {
      setCompletionError(localizedErrorMessage(error, 'completion.saveError'))
    } finally {
      completionLock.current = false
      setCompleting(false)
    }
  }

  if (!session?.diagnosis) {
    return (
      <PageShell className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label={t('common.loading')} />
      </PageShell>
    )
  }

  const nearbyHref = `/nearby-shops?appliance=${encodeURIComponent(session.diagnosis.issueName.slice(0, 60))}`
  const statusMessage =
    comparison.kind === 'needs_before'
      ? t('verify.beforeRequired')
      : comparison.kind === 'needs_after'
        ? t('verify.afterRequired')
        : comparison.kind === 'comparing'
          ? t(stageLabelKey(comparison.stage))
          : ''

  return (
    <PageShell className="min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-xl">
        <button
          type="button"
          onClick={() => navigate('/guide')}
          className={`mb-4 inline-flex items-center gap-2 rounded-lg text-sm text-text-secondary hover:text-primary ${focusRing}`}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('common.back')}
        </button>

        <h1 className="text-heading-lg text-text-primary">{t('verify.title')}</h1>
        <p className="mt-2 text-sm text-text-secondary">{t('verify.subtitle')}</p>

        <p role="note" className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-surface/60 p-3 text-sm text-text-secondary">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t('verify.limitation')}</span>
        </p>

        {completionError && (
          <div role="alert" className="mt-6 rounded-xl border border-error/50 bg-error/10 p-4">
            <p className="text-sm text-error">{completionError}</p>
          </div>
        )}

        <section className="mt-6 space-y-6" aria-labelledby="verify-photos-heading">
          <h2 id="verify-photos-heading" className="sr-only">{t('verify.title')}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Before photo: only the photo from this device's scan can be used. */}
            <div className="glass-panel flex flex-col overflow-hidden rounded-2xl p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">{t('verify.beforePhoto')}</span>
                <span className="rounded-md bg-surface-high px-2 py-0.5 text-xs text-text-subtle">1 / 2</span>
              </div>
              <div className="relative aspect-video flex-1 overflow-hidden rounded-xl bg-background/60">
                {hasBefore ? (
                  <img
                    src={session.imageDataUrl}
                    alt={t('verify.beforePhotoAlt')}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                    <ImageIcon className="h-8 w-8 text-text-subtle" aria-hidden="true" />
                    <p className="mt-2 text-xs text-text-secondary">{t('verify.beforeMissing')}</p>
                  </div>
                )}
              </div>
            </div>

            {/* After photo: take or upload; "Retake photo" clears it. */}
            <div className="flex flex-col">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-semibold text-text-primary">{t('verify.afterPhoto')}</span>
                <span className="rounded-md bg-surface-high px-2 py-0.5 text-xs text-text-subtle">2 / 2</span>
              </div>
              <PhotoCapture photo={afterPhoto} onChange={changeAfterPhoto} />
            </div>
          </div>

          {/* Remaining symptoms */}
          <fieldset className="glass-panel space-y-3 rounded-2xl p-4 sm:p-5">
            <legend className="px-1 text-sm font-medium text-text-primary">{t('verify.symptoms.question')}</legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {(['yes', 'no', 'not_sure'] as const).map((value) => (
                <label
                  key={value}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm text-text-primary has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                >
                  <input
                    type="radio"
                    name="remaining-symptoms"
                    value={value}
                    checked={symptoms === value}
                    onChange={() => setSymptoms(value)}
                    className={`h-5 w-5 shrink-0 accent-[#00f5d4] ${focusRing}`}
                  />
                  <span>
                    {value === 'yes'
                      ? t('verify.symptoms.yes')
                      : value === 'no'
                        ? t('verify.symptoms.no')
                        : t('verify.symptoms.notSure')}
                  </span>
                </label>
              ))}
            </div>
            <label htmlFor="symptom-details" className="block text-sm text-text-secondary">
              {t('verify.symptoms.detailsLabel')}
            </label>
            <textarea
              id="symptom-details"
              value={symptomDetails}
              onChange={(event) => setSymptomDetails(event.target.value.slice(0, MAX_SYMPTOM_DETAILS))}
              maxLength={MAX_SYMPTOM_DETAILS}
              rows={3}
              placeholder={t('verify.symptoms.detailsPlaceholder')}
              aria-describedby="symptom-details-count"
              className={`w-full resize-none rounded-xl border border-border bg-background/80 p-3 text-sm text-text-primary placeholder:text-text-subtle ${focusRing}`}
            />
            <p id="symptom-details-count" className="text-right text-xs text-text-subtle">
              {symptomDetails.length}/{MAX_SYMPTOM_DETAILS}
            </p>
            {(symptoms === 'yes' || symptoms === 'not_sure') && (
              <div role="status" className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm sm:flex-row sm:items-center">
                <p className="flex-1 text-text-primary">{t('verify.symptoms.helpNote')}</p>
                <Link
                  to={nearbyHref}
                  className={`inline-flex min-h-11 items-center justify-center rounded-lg border border-warning/50 px-4 py-2 font-semibold text-warning ${focusRing}`}
                >
                  {t('blocked.findHelp')}
                </Link>
              </div>
            )}
          </fieldset>

          {/* Input hints and progress are announced. */}
          <div role="status" aria-live="polite" className="min-h-6 text-sm text-text-secondary">
            {comparing ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {statusMessage}
              </span>
            ) : (
              statusMessage
            )}
          </div>

          {comparison.kind === 'error' && (
            <div role="alert" className="rounded-2xl border border-warning/50 bg-warning/10 p-4">
              <p className="flex items-center gap-2 font-semibold text-warning">
                {comparison.error === 'offline' ? (
                  <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
                )}
                {t('verify.errorPanel.title')}
              </p>
              <p className="mt-2 text-sm text-text-primary">{t(errorMessageKey(comparison.error))}</p>
              {(comparison.error === 'offline' || comparison.error === 'failed') && (
                <button
                  type="button"
                  onClick={attemptComparison}
                  className={`mt-3 min-h-11 rounded-lg border border-warning/50 px-4 py-2 text-sm font-semibold text-warning ${focusRing}`}
                >
                  {t('common.retry')}
                </button>
              )}
            </div>
          )}

          {comparison.kind === 'inconclusive' && (
            <div role="status" className="rounded-2xl border border-border bg-surface-high/60 p-4">
              <p className="flex items-center gap-2 font-semibold text-text-primary">
                <HelpCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                {t('verify.inconclusive.title')}
              </p>
              <p className="mt-2 text-sm text-text-secondary">{t('verify.inconclusive.body')}</p>
            </div>
          )}

          {comparison.kind === 'observed' && (
            <div role="status" className="rounded-2xl border border-border bg-surface/60 p-4">
              <p className="text-sm font-semibold text-text-secondary">{t('verify.observation.title')}</p>
              <p className="mt-1 text-base font-medium text-text-primary">
                {t(observationLabelKey(comparison.observation))}
              </p>
              <p className="mt-2 text-sm text-text-secondary">{t('verify.limitation')}</p>
              {comparison.observation === 'needs_professional' && (
                <div role="alert" className="mt-4 rounded-xl border border-error/60 bg-error/15 p-4 text-sm">
                  <p className="flex items-center gap-2 font-bold text-error">
                    <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                    {t('verify.observation.needs_professional')}
                  </p>
                  <p className="mt-2 text-text-primary/90">{t('verify.safetyMessage')}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => void handleFinishSteps()}
              disabled={comparing || completing}
              aria-busy={completing}
              aria-describedby="verify-finish-hint"
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-semibold text-text-secondary hover:text-text-primary disabled:opacity-50 ${focusRing}`}
            >
              {completing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {completing ? t('verify.completing') : t('verify.finish')}
            </button>

            <button
              type="button"
              onClick={attemptComparison}
              disabled={!canStartComparison(inputState(hasBefore, afterPhoto !== null)) || comparing || completing}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-background hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none ${focusRing}`}
            >
              {comparing && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
              {t('verify.submit')}
            </button>
          </div>
          <p id="verify-finish-hint" className="text-xs text-text-subtle">
            {t('verify.finishHint')}
          </p>
        </section>
      </div>
    </PageShell>
  )
}
