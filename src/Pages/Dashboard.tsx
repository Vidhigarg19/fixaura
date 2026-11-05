import { Camera, History, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import PageShell from '../components/PageShell'
import { useAuth } from '../components/authContext'
import { t } from '../i18n'

const dashboardLinks = [
  { to: '/capture', label: 'dashboard.startDiagnosis', icon: Camera },
  { to: '/history', label: 'dashboard.repairHistory', icon: History },
  { to: '/diagnosis-history', label: 'dashboard.diagnosisHistory', icon: Wrench },
]

export default function Dashboard() {
  const { user } = useAuth()

  return (
    <PageShell className="px-4 py-10 sm:py-14">
      <main className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
          {t('dashboard.eyebrow')}
        </p>
        <h1 className="mt-3 text-heading-lg">{t('dashboard.title')}</h1>
        {user?.email && (
          <p className="mt-2 text-text-secondary">
            {t('dashboard.signedInAs')} {user.email}
          </p>
        )}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {dashboardLinks.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="glass-panel flex min-h-28 items-center gap-4 rounded-2xl p-5 transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="font-semibold">{t(label)}</span>
            </Link>
          ))}
        </div>
      </main>
    </PageShell>
  )
}
