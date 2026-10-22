
import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import PageShell from '../components/PageShell'
import ConfidenceMeter from '../components/ConfidenceMeter'
import FallbackMode from '../components/FallbackMode'
import { getSession } from '../services/repairSession'
import { saveSession } from '../services/repairSession'
import { t } from '../i18n'
import type { RiskLevel } from '../types/repair'
import { supabase } from '../lib/supabase'

const CONFIDENCE_THRESHOLD = 70
const diagnosisSaveOperations = new Map<string, Promise<void>>()

function saveDiagnosisOnce(attemptId: string, save: () => Promise<void>) {
  const existingOperation = diagnosisSaveOperations.get(attemptId)
  if (existingOperation) return existingOperation

  const operation = save().finally(() => {
    if (diagnosisSaveOperations.get(attemptId) === operation) {
      diagnosisSaveOperations.delete(attemptId)
    }
  })
  diagnosisSaveOperations.set(attemptId, operation)
  return operation
}

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
  const [session] = useState(getSession)
  const [expanded, setExpanded] = useState(false)
  const [saveStatus, setSaveStatus] = useState('Saving diagnosis...')
  const [repairSessionReady, setRepairSessionReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function saveDiagnosis() {
      if (!session?.diagnosis) return
      const attemptId = session.diagnosisAttemptId || crypto.randomUUID()
      if (!session.diagnosisAttemptId) {
        saveSession({ diagnosisAttemptId: attemptId })
      }

      try {
        await saveDiagnosisOnce(attemptId, async () => {
          const {
            data: { user },
            error: authError,
          } = await supabase.auth.getUser()

          if (authError) throw authError
          if (!user) throw new Error('Please log in to save your diagnosis.')

          const d = session.diagnosis
          const applianceName = session.applianceType?.trim()
          if (!applianceName) throw new Error('The appliance name is missing.')

          let persistence =
            session.diagnosisPersistence?.userId === user.id
              ? { ...session.diagnosisPersistence }
              : { userId: user.id }
          saveSession({ diagnosisAttemptId: attemptId, diagnosisPersistence: persistence })

          let applianceId = persistence.applianceId
          if (applianceId) {
            const { data: appliance, error } = await supabase
              .from('appliances')
              .select('id')
              .eq('id', applianceId)
              .eq('user_id', user.id)
              .maybeSingle()

            if (error) throw error
            if (!appliance) throw new Error('The saved appliance could not be verified.')
          } else {
            const { data: matchingAppliances, error: findApplianceError } =
              await supabase
                .from('appliances')
                .select('id')
                .eq('user_id', user.id)
                .eq('name', applianceName)
                .eq('appliance_type', applianceName)
                .limit(2)

            if (findApplianceError) throw findApplianceError
            if (matchingAppliances.length > 1) {
              throw new Error(
                'Multiple appliances match this name. Resolve the duplicate appliances before saving this diagnosis.'
              )
            }

            if (matchingAppliances.length === 1) {
              applianceId = matchingAppliances[0].id
            } else {
              const { data: newAppliance, error: createApplianceError } =
                await supabase
                  .from('appliances')
                  .insert({
                    user_id: user.id,
                    name: applianceName,
                    appliance_type: applianceName,
                  })
                  .select('id')
                  .single()

              if (createApplianceError) throw createApplianceError
              applianceId = newAppliance.id
            }

            persistence = { ...persistence, applianceId }
            saveSession({ diagnosisAttemptId: attemptId, diagnosisPersistence: persistence })
          }

          let diagnosisId = persistence.diagnosisId
          if (diagnosisId) {
            const { data: diagnosis, error } = await supabase
              .from('diagnoses')
              .select('id')
              .eq('id', diagnosisId)
              .eq('user_id', user.id)
              .maybeSingle()

            if (error) throw error
            if (!diagnosis) diagnosisId = undefined
          }

          if (!diagnosisId) {
            const { data: diagnosisRow, error: diagnosisError } = await supabase
              .from('diagnoses')
              .insert({
                user_id: user.id,
                appliance_type: applianceName,
                issue_title: d.issueName,
                diagnosis_result: d,
              })
              .select('id')
              .single()

            if (diagnosisError) throw diagnosisError
            diagnosisId = diagnosisRow.id
            persistence = { ...persistence, diagnosisId }
            saveSession({ diagnosisAttemptId: attemptId, diagnosisPersistence: persistence })
          }

          const { data: existingSessions, error: findSessionError } = await supabase
            .from('repair_sessions')
            .select('id, appliance_id')
            .eq('user_id', user.id)
            .eq('diagnosis_id', diagnosisId)
            .limit(2)

          if (findSessionError) throw findSessionError
          if (existingSessions.length > 1) {
            throw new Error('Multiple repair sessions already exist for this diagnosis.')
          }

          const existingSession = existingSessions[0]
          if (existingSession) {
            if (existingSession.appliance_id === null) {
              throw new Error(
                'An existing repair session is missing its appliance link. It was left unchanged; review it in Supabase before retrying.'
              )
            } else if (existingSession.appliance_id !== applianceId) {
              throw new Error('The repair session is linked to a different appliance.')
            }
            persistence = { ...persistence, repairSessionId: existingSession.id }
            saveSession({ diagnosisAttemptId: attemptId, diagnosisPersistence: persistence })
          } else {
            const { data: createdSession, error: createSessionError } = await supabase
              .from('repair_sessions')
              .insert({
                user_id: user.id,
                appliance_id: applianceId,
                diagnosis_id: diagnosisId,
                status: 'in_progress',
              })
              .select('id, user_id, diagnosis_id, appliance_id')
              .single()

            if (createSessionError) throw createSessionError
            if (
              createdSession.user_id !== user.id ||
              createdSession.diagnosis_id !== diagnosisId ||
              createdSession.appliance_id !== applianceId
            ) {
              throw new Error('The repair session was not saved with the expected links.')
            }
            persistence = { ...persistence, repairSessionId: createdSession.id }
            saveSession({ diagnosisAttemptId: attemptId, diagnosisPersistence: persistence })
          }
        })

        if (!cancelled) {
          setRepairSessionReady(true)
          setSaveStatus('Diagnosis and repair session saved successfully.')
        }
      } catch (error) {
        console.error('Diagnosis save failed:', error)

        if (!cancelled) {
          setSaveStatus(
            error instanceof Error
              ? `Could not save diagnosis: ${error.message}`
              : 'Could not save diagnosis.'
          )
        }
      }
    }

    void saveDiagnosis()

    return () => {
      cancelled = true
    }
  }, [session])

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

        <p role="status" className="text-sm text-text-secondary mb-4">
          {saveStatus}
        </p>

        {lowConfidence && (
          <div className="mb-6">
            <FallbackMode
              onContinue={() => navigate('/tools')}
              continueDisabled={!repairSessionReady}
            />
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex justify-center mb-8"
        >
          <ConfidenceMeter value={d.confidence} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-panel rounded-xl p-6 space-y-5 mb-6"
        >
          <div>
            <p className="text-label-bold text-text-subtle mb-1">
              {t('diagnosis.detectedIssue')}
            </p>
            <p className="text-heading-md">{d.issueName}</p>
          </div>

          <div>
            <p className="text-label-bold text-text-subtle mb-1">
              {t('diagnosis.summary')}
            </p>
            <p className="text-body-md text-text-secondary">{d.summary}</p>
          </div>

          <div>
            <p className="text-label-bold text-text-subtle mb-1">
              {t('diagnosis.recommendedFix')}
            </p>
            <p className="text-body-md text-text-secondary">{d.recommendedFix}</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-label-bold text-text-subtle">
              {t('diagnosis.riskLevel')}
            </span>
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
            disabled={!repairSessionReady}
            className="flex-1 rounded-xl bg-primary py-3 font-semibold text-background disabled:opacity-50"
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
