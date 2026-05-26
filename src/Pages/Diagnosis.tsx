import { motion } from 'framer-motion'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import PageShell from '../components/PageShell'
import ConfidenceMeter from '../components/ConfidenceMeter'
import FallbackMode from '../components/FallbackMode'
import { getSession } from '../services/repairSession'
import { t } from '../i18n'
import type { RiskLevel } from '../types/repair'

const CONFIDENCE_THRESHOLD = 70

function riskLabel(severity: RiskLevel) {
  if (severity === 'low') return t('diagnosis.riskLow')
  if (severity === 'high') return t('diagnosis.riskHigh')
  return t('diagnosis.riskMedium')
}

function riskColor(severity: RiskLevel) {
  if (severity === 'low') return 'text-success border-success/40 bg-success/10'
  if (severity === 'high') return 'text-error border-error/40 bg-error/10'
  return 'text-warning border-warning/40 bg-warning/10'
}

export default function Diagnosis() {
  const navigate = useNavigate()
  const session = getSession()
  const [expanded, setExpanded] = useState(false)

  if (!session?.diagnosis) {
    return (
      <PageShell className="flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-text-secondary mb-4">{t('common.error')}</p>
          <Link to="/capture" className="text-primary underline">
            {t('diagnosis.ctaRetake')}
          </Link>
        </div>
      </PageShell>
    )
  }

  const d = session.diagnosis
  const lowConfidence = d.confidence < CONFIDENCE_THRESHOLD

  return (
    <PageShell className="pb-24">
      <div className="mx-auto max-w-lg px-4 pt-8">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-heading-lg mb-8"
        >
          {t('diagnosis.title')}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex justify-center mb-8"
        >
          <ConfidenceMeter value={d.confidence} />
        </motion.div>

        {lowConfidence && (
          <div className="mb-6">
            <FallbackMode onContinue={() => navigate('/tools')} />
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-panel rounded-xl p-6 space-y-5 mb-6"
        >
          <div>
            <p className="text-label-bold text-text-subtle mb-1">{t('diagnosis.detectedIssue')}</p>
            <p className="text-heading-md">{d.issueName}</p>
          </div>
          <div>
            <p className="text-label-bold text-text-subtle mb-1">{t('diagnosis.summary')}</p>
            <p className="text-body-md text-text-secondary">{d.summary}</p>
          </div>
          <div>
            <p className="text-label-bold text-text-subtle mb-1">{t('diagnosis.recommendedFix')}</p>
            <p className="text-body-md text-text-secondary">{d.recommendedFix}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-label-bold text-text-subtle">{t('diagnosis.riskLevel')}</span>
            <span
              className={`text-label-bold px-3 py-1 rounded-full border ${riskColor(d.severity)}`}
            >
              {riskLabel(d.severity)}
            </span>
          </div>
        </motion.div>

        <motion.button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between glass-panel rounded-xl px-4 py-3 mb-8 text-left"
          whileHover={{ scale: 1.01 }}
        >
          <span className="font-medium">{t('diagnosis.whyResult')}</span>
          {expanded ? <ChevronUp /> : <ChevronDown />}
        </motion.button>
        {expanded && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="text-text-secondary text-sm mb-8 -mt-4 px-2"
          >
            {d.explanation || d.summary}
          </motion.p>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/tools')}
            className="flex-1 rounded-xl bg-primary py-3 font-semibold text-background"
          >
            {t('diagnosis.ctaTools')}
          </motion.button>
          <Link to="/capture" className="flex-1">
            <motion.span
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="block text-center rounded-xl border border-border py-3 text-text-secondary"
            >
              {t('diagnosis.ctaRetake')}
            </motion.span>
          </Link>
        </div>
      </div>
    </PageShell>
  )
}
