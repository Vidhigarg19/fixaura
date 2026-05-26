import { motion } from 'framer-motion'
import { AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { t } from '../i18n'

interface FallbackModeProps {
  onContinue?: () => void
}

export default function FallbackMode({ onContinue }: FallbackModeProps) {
  const navigate = useNavigate()

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.4,
        repeat: 2,
        repeatType: 'reverse',
        repeatDelay: 2,
      }}
      className="glass-panel rounded-xl border border-warning/40 p-5 shadow-glow-amber"
    >
      <div className="flex gap-4">
        <AlertCircle className="h-8 w-8 text-warning shrink-0" />
        <div>
          <h3 className="text-lg font-bold text-warning mb-1">{t('fallback.title')}</h3>
          <p className="text-body-md text-text-secondary mb-4">{t('fallback.body')}</p>
          <div className="flex flex-wrap gap-3">
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/capture')}
              className="rounded-xl bg-warning/15 border border-warning/40 px-4 py-2 text-sm font-semibold text-warning"
            >
              {t('fallback.retake')}
            </motion.button>
            {onContinue && (
              <motion.button
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={onContinue}
                className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary"
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
