import { motion } from 'framer-motion'
import CountUp from 'react-countup'
import { Link } from 'react-router-dom'
import { CheckCircle2, Share2, RotateCcw, Star } from 'lucide-react'
import { useState } from 'react'
import PageShell from '../components/PageShell'
import { clearSession, getSession } from '../services/repairSession'
import { t } from '../i18n'

export default function Completion() {
  const session = getSession()
  const [rating, setRating] = useState(0)
  const [rated, setRated] = useState(false)

  const money = session?.moneySaved ?? 85
  const timeMin = session?.timeSavedMinutes ?? 45
  const waste = session?.diagnosis?.severity === 'high' ? 2.4 : 1.1

  const share = async () => {
    const text = `I just completed a repair with FixAura — saved ~$${money} and ${timeMin} minutes!`
    if (navigator.share) {
      await navigator.share({ title: 'FixAura', text })
    } else {
      await navigator.clipboard.writeText(text)
    }
  }

  const startAnother = () => {
    clearSession()
  }

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

        <div className="grid gap-4 mb-10">
          {[
            { label: t('completion.moneySaved'), value: money, prefix: '$' },
            { label: t('completion.timeSaved'), value: timeMin, suffix: ' min' },
            { label: t('completion.wasteAvoided'), value: waste, suffix: ' kg' },
          ].map((metric, i) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: [0, -4, 0] }}
              transition={{
                opacity: { delay: 0.3 + i * 0.1, duration: 0.4 },
                y: { duration: 3, repeat: Infinity, delay: i * 0.3 },
              }}
              className="glass-panel rounded-xl p-6"
            >
                <p className="text-label-bold text-text-subtle mb-2">{metric.label}</p>
                <p className="text-3xl font-bold text-primary">
                  {metric.prefix}
                  <CountUp end={metric.value} duration={2} decimals={metric.suffix?.includes('kg') ? 1 : 0} />
                  {metric.suffix}
                </p>
            </motion.div>
          ))}
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
                aria-label={`Rate ${n}`}
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
