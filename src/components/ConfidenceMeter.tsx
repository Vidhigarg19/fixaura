import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { t } from '../i18n'

interface ConfidenceMeterProps {
  value: number
  size?: number
}

export default function ConfidenceMeter({ value, size = 140 }: ConfidenceMeterProps) {
  const clamped = Math.min(100, Math.max(0, value))
  const radius = (size - 12) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference

  const { stroke, label } = useMemo(() => {
    if (clamped >= 70) return { stroke: '#51CF66', label: t('confidence.high') }
    if (clamped >= 45) return { stroke: '#FFD43B', label: t('confidence.medium') }
    return { stroke: '#FFB4AB', label: t('confidence.low') }
  }, [clamped])

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#27354C"
            strokeWidth="8"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 8px ${stroke}55)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-3xl font-bold text-text-primary"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            {Math.round(clamped)}%
          </motion.span>
        </div>
      </div>
      <p className="text-label-bold text-text-subtle">{t('confidence.label')}</p>
      <p className="text-sm text-text-secondary">{label}</p>
    </div>
  )
}
