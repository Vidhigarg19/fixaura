import { motion, useReducedMotion } from 'framer-motion'
import { AlertCircle } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLocale, subscribeLocale, t } from '../i18n'

interface FallbackModeProps {
  onContinue?: () => void
  continueDisabled?: boolean
}

export default function FallbackMode({ onContinue, continueDisabled = false }: FallbackModeProps) {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  useSyncExternalStore(subscribeLocale, getLocale, getLocale)

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.4, repeat: 2, repeatType: 'reverse', repeatDelay: 2 }
      }
      className="glass-panel rounded-xl border border-warning/40 p-5 shadow-glow-amber"
    >
      <div className="flex gap-4">
        <AlertCircle className="h-8 w-8 text-warning shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-warning mb-1 break-words">{t('fallback.title')}</h2>
          <p className="text-body-md text-text-secondary mb-4">{t('fallback.body')}</p>
          <div className="flex flex-wrap gap-3">
            <motion.button
              type="button"
              whileHover={reduceMotion ? undefined : { scale: 1.03 }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              onClick={() => navigate('/capture')}
              className="min-h-11 rounded-xl bg-warning/15 border border-warning/40 px-4 py-2 text-sm font-semibold text-warning"
            >
              {t('fallback.retake')}
            </motion.button>
            {onContinue && (
              <motion.button
                type="button"
                whileHover={reduceMotion ? undefined : { scale: 1.03 }}
                whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                onClick={onContinue}
                disabled={continueDisabled}
                className="min-h-11 rounded-xl border border-border px-4 py-2 text-sm text-text-secondary disabled:opacity-50"
              >
                {t('fallback.continueCaution')}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
