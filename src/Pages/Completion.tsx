import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Info, ListChecks, RotateCcw, Share2, Star } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import PageShell from '../components/PageShell'
import { clearSession, getSession } from '../services/repairSession'
import { getLocale, subscribeLocale, t } from '../i18n'

// V07: this page only says that the repair STEPS were marked as finished.
// It is not a safety check, it does not confirm the repair worked, and it never
// shows or implies a photo comparison (none is available right now).
export default function Completion() {
  useSyncExternalStore(subscribeLocale, getLocale)
  const session = getSession()
  const [rating, setRating] = useState(0)
  const [rated, setRated] = useState(false)

  const completion = session?.completedRepair
  // A guest's finish is only recorded on this device, never in an account.
  const savedToAccount = Boolean(completion && completion.diagnosisId !== 'guest-repair')

  const share = async () => {
    const text = `${t('completion.sharePrefix')}${completion?.repairSummary ?? t('completion.noSummary')}`
    if (navigator.share) {
      await navigator.share({ title: t('completion.shareTitle'), text })
    } else {
      await navigator.clipboard.writeText(text)
    }
  }

  const startAnother = () => {
    clearSession()
  }

  if (!completion) {
    return (
      <PageShell className="pb-16">
        <div className="mx-auto max-w-lg px-4 pt-16 text-center">
          <div className="mb-6 inline-flex rounded-full bg-surface-high p-6">
            <Info className="h-12 w-12 text-text-secondary" aria-hidden="true" />
          </div>
          <h1 role="status" className="text-heading-xl mb-3">
            {t('completion.notCompleted')}
          </h1>
          <p className="text-text-secondary mb-10">{t('completion.notFinishedBody')}</p>
          <div className="flex flex-col gap-3">
            <Link
              to="/dashboard"
              className="flex items-center justify-center rounded-xl bg-primary py-3 font-semibold text-background focus-visible:outline-2 focus-visible:outline-primary"
            >
              {t('nav.dashboard')}
            </Link>
            <Link
              to="/capture"
              onClick={startAnother}
              className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 py-3 text-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              {t('completion.startAnother')}
            </Link>
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell className="pb-16">
      <div className="relative mx-auto max-w-lg px-4 pt-16 text-center">
        <div className="mb-6 inline-flex rounded-full bg-surface-high p-6">
          <ListChecks className="h-12 w-12 text-text-secondary" aria-hidden="true" />
        </div>

        <h1 className="text-heading-xl mb-3">{t('completion.title')}</h1>
        <p className="text-text-secondary mb-6">{t('completion.subtitle')}</p>

        <div role="note" className="mb-8 rounded-xl border border-warning/40 bg-warning/5 p-4 text-left text-sm text-text-primary">
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span>{t('completion.notSafetyCheck')}</span>
          </p>
          <p className="mt-2 text-text-secondary">{t('completion.noComparison')}</p>
          {!savedToAccount && <p className="mt-2 text-text-secondary">{t('completion.notSaved')}</p>}
        </div>

        <div className="glass-panel rounded-xl p-6 mb-10 text-left">
          <p className="text-label-bold text-text-subtle mb-2">{t('completion.repairSummary')}</p>
          <p className="text-body-md whitespace-pre-wrap">
            {completion.repairSummary || t('completion.noSummary')}
          </p>
          <p className="text-sm text-text-subtle mt-4">
            {t('completion.completedAt')}{' '}
            {new Date(completion.completedAt).toLocaleString()}
          </p>
          <p className="text-sm text-text-subtle mt-2">{t('completion.savingsUnavailable')}</p>
        </div>

        <div className="glass-panel rounded-xl p-6 mb-8">
          <p className="text-sm text-text-secondary mb-3">{t('completion.rating')}</p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <motion.button
                key={n}
                type="button"
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  setRating(n)
                  setRated(true)
                }}
                aria-label={`${t('completion.rateAria')} ${n}/5`}
                aria-pressed={n <= rating}
                className="rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Star
                  className={`h-8 w-8 ${n <= rating ? 'fill-warning text-warning' : 'text-border'}`}
                  aria-hidden="true"
                />
              </motion.button>
            ))}
          </div>
          {rated && <p role="status" className="text-sm text-text-secondary mt-3">{t('completion.thanks')}</p>}
        </div>

        <div className="flex flex-col gap-3">
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => void share()}
            className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 py-3 text-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Share2 className="h-5 w-5" aria-hidden="true" />
            {t('completion.share')}
          </motion.button>
          <Link
            to="/capture"
            onClick={startAnother}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-background focus-visible:outline-2 focus-visible:outline-primary"
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
            {t('completion.startAnother')}
          </Link>
        </div>
      </div>
    </PageShell>
  )
}
