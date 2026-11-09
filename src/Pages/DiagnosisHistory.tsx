
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import PageShell from '../components/PageShell'
import { supabase } from '../lib/supabase'
import { getLocale, subscribeLocale, t } from '../i18n'

type DiagnosisRecord = {
  id: string
  appliance_type: string
  issue_title: string
  diagnosis_result: {
    summary?: string
    severity?: string
    confidence?: number
    recommendedFix?: string
  } | null
  created_at: string
}

type HistoryMessage = 'loginRequired' | 'loadError' | null

const SEVERITY_KEYS: Record<string, string> = {
  low: 'diagnosis.riskLow',
  medium: 'diagnosis.riskMedium',
  high: 'diagnosis.riskHigh',
}

function severityLabel(severity: string): string {
  const key = SEVERITY_KEYS[severity.trim().toLowerCase()]
  // Unknown values from older records are shown as stored rather than hidden.
  return key ? t(key) : severity
}

export default function DiagnosisHistory() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale)
  const [records, setRecords] = useState<DiagnosisRecord[]>([])
  const [loading, setLoading] = useState(true)
  // Store which message to show, not its text, so it follows the language toggle.
  const [message, setMessage] = useState<HistoryMessage>(null)

  useEffect(() => {
    let cancelled = false

    async function loadHistory() {
      try {
        const { data: { user }, error: authError } =
          await supabase.auth.getUser()

        if (authError) throw authError

        if (!user) {
          if (!cancelled) {
            setMessage('loginRequired')
          }
          return
        }

        const { data, error } = await supabase
          .from('diagnoses')
          .select('id, appliance_type, issue_title, diagnosis_result, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (error) throw error

        if (!cancelled) {
          setRecords((data ?? []) as DiagnosisRecord[])
        }
      } catch (error) {
        console.error('Diagnosis history failed to load:', error)
        if (!cancelled) {
          setMessage('loadError')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadHistory()

    return () => {
      cancelled = true
    }
  }, [])

  const dateLocale = locale === 'hi' ? 'hi-IN' : 'en-IN'

  return (
    <PageShell className="pb-24">
      <div className="mx-auto max-w-lg px-4 pt-8">
        <h1 className="text-heading-lg mb-2 break-words">{t('diagnosisHistory.title')}</h1>
        <p className="text-text-secondary mb-6">
          {t('diagnosisHistory.subtitle')}
        </p>

        {loading && (
          <p role="status" className="text-text-secondary">{t('diagnosisHistory.loading')}</p>
        )}

        {!loading && message && (
          <p role="status" className="text-text-secondary mb-4 break-words">
            {t(`diagnosisHistory.${message}`)}
          </p>
        )}

        {!loading && !message && records.length === 0 && (
          <div className="glass-panel rounded-xl p-5">
            <p>{t('diagnosisHistory.empty')}</p>
            <Link to="/capture" className="text-primary underline mt-3 inline-flex min-h-11 items-center">
              {t('diagnosisHistory.startNew')}
            </Link>
          </div>
        )}

        <div className="space-y-4">
          {records.map((record) => (
            <article
              key={record.id}
              className="glass-panel rounded-xl p-5 space-y-2"
            >
              <h2 className="text-heading-md break-words">{record.issue_title}</h2>

              <p className="text-text-secondary text-sm break-words">
                {t('diagnosisHistory.appliance')}: {record.appliance_type}
              </p>

              <p className="text-text-secondary text-sm">
                {t('diagnosisHistory.date')}: {new Date(record.created_at).toLocaleString(dateLocale)}
              </p>

              {record.diagnosis_result?.severity && (
                <p className="text-text-secondary text-sm">
                  {t('diagnosisHistory.risk')}: {severityLabel(record.diagnosis_result.severity)}
                </p>
              )}

              {typeof record.diagnosis_result?.confidence === 'number' && (
                <p className="text-text-secondary text-sm">
                  {t('diagnosisHistory.confidence')}: {record.diagnosis_result.confidence}%
                </p>
              )}

              {record.diagnosis_result?.summary && (
                <p className="text-text-secondary break-words">
                  {record.diagnosis_result.summary}
                </p>
              )}

              {record.diagnosis_result?.recommendedFix && (
                <p className="text-text-secondary text-sm break-words">
                  {t('diagnosisHistory.recommendedFix')}: {record.diagnosis_result.recommendedFix}
                </p>
              )}
            </article>
          ))}
        </div>

        <Link
          to="/capture"
          className="block min-h-11 text-center rounded-xl bg-primary py-3 font-semibold text-background mt-6"
        >
          {t('diagnosisHistory.newDiagnosis')}
        </Link>

        <Link
          to="/"
          className="block min-h-11 py-3 text-center text-text-secondary underline mt-4"
        >
          {t('diagnosisHistory.backHome')}
        </Link>
      </div>
    </PageShell>
  )
}
