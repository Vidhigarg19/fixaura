import { motion } from 'framer-motion'
import { Link, Navigate } from 'react-router-dom'
import { CheckCircle2, Share2, RotateCcw, Star } from 'lucide-react'
import { useState } from 'react'
import PageShell from '../components/PageShell'
import { clearSession, getSession } from '../services/repairSession'
import { t } from '../i18n'

export default function Completion() {
  const session = getSession()
  const [rating, setRating] = useState(0)
  const [rated, setRated] = useState(false)

  const completion = session?.completedRepair

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

  if (!completion || !session?.diagnosis) return <Navigate to="/" replace />

  return (
    <PageShell className="pb-16">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 24 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-primary/60"
            style={{
              left: `${(i * 17) % 100}%`,
              top: `-10%`,
            }}
            animate={{
              y: ['0vh', '110vh'],
              opacity: [1, 0],
              rotate: [0, 360],
            }}
            transition={{
              duration: 4 + (i % 3),
              repeat: Infinity,
              delay: i * 0.15,
              ease: 'linear',
            }}
          />
        ))}
      </div>

      <div className="relative mx-auto max-w-lg px-4 pt-16 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 14 }}
          className="inline-flex rounded-full bg-success/20 p-6 mb-6 glow-teal"
        >
          <CheckCircle2 className="h-16 w-16 text-success" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-heading-xl mb-3"
        >
          {t('completion.title')}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-text-secondary mb-10"
        >
          {t('completion.subtitle')}
        </motion.p>

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
                aria-label={t('completion.rateAria')}
              >
                <Star
                  className={`h-8 w-8 ${n <= rating ? 'fill-warning text-warning' : 'text-border'}`}
                />
              </motion.button>
            ))}
          </div>
          {rated && <p className="text-sm text-success mt-3">{t('completion.thanks')}</p>}
        </div>

        <div className="flex flex-col gap-3">
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => void share()}
            className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 py-3 text-primary"
          >
            <Share2 className="h-5 w-5" />
            {t('completion.share')}
          </motion.button>
          <Link to="/capture" onClick={startAnother}>
            <motion.span
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-background"
            >
              <RotateCcw className="h-5 w-5" />
              {t('completion.startAnother')}
            </motion.span>
          </Link>
        </div>
      </div>
    </PageShell>
  )
}
