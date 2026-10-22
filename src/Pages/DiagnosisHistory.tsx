
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageShell from '../components/PageShell'
import { supabase } from '../lib/supabase'

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

export default function DiagnosisHistory() {
  const [records, setRecords] = useState<DiagnosisRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadHistory() {
      try {
        const { data: { user }, error: authError } =
          await supabase.auth.getUser()

        if (authError) throw authError

        if (!user) {
          if (!cancelled) {
            setMessage('Please log in to view your diagnosis history.')
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
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Could not load diagnosis history.'
          )
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

  return (
    <PageShell className="pb-24">
      <div className="mx-auto max-w-lg px-4 pt-8">
        <h1 className="text-heading-lg mb-2">Diagnosis History</h1>
        <p className="text-text-secondary mb-6">
          Your previously saved repair diagnoses.
        </p>

        {loading && (
          <p className="text-text-secondary">Loading history...</p>
        )}

        {!loading && message && (
          <p role="status" className="text-text-secondary mb-4">
            {message}
          </p>
        )}

        {!loading && !message && records.length === 0 && (
          <div className="glass-panel rounded-xl p-5">
            <p>No saved diagnoses yet.</p>
            <Link to="/capture" className="text-primary underline mt-3 inline-block">
              Start a new diagnosis
            </Link>
          </div>
        )}

        <div className="space-y-4">
          {records.map((record) => (
            <article
              key={record.id}
              className="glass-panel rounded-xl p-5 space-y-2"
            >
              <h2 className="text-heading-md">{record.issue_title}</h2>

              <p className="text-text-secondary text-sm">
                Appliance: {record.appliance_type}
              </p>

              <p className="text-text-secondary text-sm">
                Date: {new Date(record.created_at).toLocaleString()}
              </p>

              {record.diagnosis_result?.severity && (
                <p className="text-text-secondary text-sm">
                  Risk: {record.diagnosis_result.severity}
                </p>
              )}

              {typeof record.diagnosis_result?.confidence === 'number' && (
                <p className="text-text-secondary text-sm">
                  Confidence: {record.diagnosis_result.confidence}%
                </p>
              )}

              {record.diagnosis_result?.summary && (
                <p className="text-text-secondary">
                  {record.diagnosis_result.summary}
                </p>
              )}

              {record.diagnosis_result?.recommendedFix && (
                <p className="text-text-secondary text-sm">
                  Recommended fix: {record.diagnosis_result.recommendedFix}
                </p>
              )}
            </article>
          ))}
        </div>

        <Link
          to="/capture"
          className="block text-center rounded-xl bg-primary py-3 font-semibold text-background mt-6"
        >
          New Diagnosis
        </Link>

        <Link
          to="/"
          className="block text-center text-text-secondary underline mt-4"
        >
          Back to home
        </Link>
      </div>
    </PageShell>
  )
}
