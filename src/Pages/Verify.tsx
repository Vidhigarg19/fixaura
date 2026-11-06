import { useNavigate, Link } from 'react-router-dom'
import { useSyncExternalStore } from 'react'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import PageShell from '../components/PageShell'
import { getLocale, subscribeLocale, t } from '../i18n'

// TEMPORARY: the comparison service can return a fake "resolved" result, so this
// page intentionally does not call it, mark the repair successful, or save a
// completed-repair record. Restore the full comparison UI from git history once
// the backend returns genuine comparison results.
export default function Verify() {
  const navigate = useNavigate()
  useSyncExternalStore(subscribeLocale, getLocale)

  return (
    <PageShell className="min-h-screen px-4 py-6 sm:py-10">
      <main className="mx-auto max-w-xl">
        <button
          type="button"
          onClick={() => navigate('/guide')}
          className="mb-4 inline-flex items-center gap-2 rounded-lg text-sm text-text-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('common.back')}
        </button>

        <h1 className="text-heading-lg text-text-primary">{t('verify.title')}</h1>

        <div
          role="status"
          className="glass-panel mt-6 flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-5"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-base font-medium text-text-primary">{t('verify.unavailable')}</p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate('/guide')}
            className="flex-1 rounded-xl border border-border px-5 py-3 text-center text-sm font-semibold text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            {t('common.back')}
          </button>
          <Link
            to="/dashboard"
            className="flex-1 rounded-xl bg-primary px-5 py-3 text-center text-sm font-bold text-background hover:brightness-110 focus-visible:outline-2 focus-visible:outline-primary"
          >
            {t('nav.dashboard')}
          </Link>
        </div>
      </main>
    </PageShell>
  )
}
