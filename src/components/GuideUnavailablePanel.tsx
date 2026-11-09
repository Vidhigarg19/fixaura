import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { Info } from 'lucide-react'
import { getLocale, subscribeLocale, t } from '../i18n'
import { withFixtureQuery } from '../utils/fixtureGate'

interface GuideUnavailablePanelProps {
  issueName?: string
}

// Shown on /tools and /guide instead of any checklist or repair steps while no
// approved guide content exists. It makes no claim that the repair is safe,
// done or checked, and offers only navigation and the existing help route.
export default function GuideUnavailablePanel({ issueName }: GuideUnavailablePanelProps) {
  useSyncExternalStore(subscribeLocale, getLocale)
  const panelRef = useRef<HTMLDivElement>(null)
  const nearbyHref = issueName
    ? `/nearby-shops?appliance=${encodeURIComponent(issueName.slice(0, 60))}`
    : '/nearby-shops'

  // Move focus to the message so keyboard and screen reader users land on it.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const actionClass =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

  return (
    <div
      ref={panelRef}
      role="status"
      tabIndex={-1}
      aria-labelledby="guide-unavailable-title"
      className="mb-6 rounded-xl border border-border bg-surface p-5 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-6 w-6 shrink-0 text-text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h1 id="guide-unavailable-title" className="text-heading-md text-text-primary">
            {t('guide.unavailableTitle')}
          </h1>
          <p className="mt-2 text-sm text-text-primary">{t('guide.unavailableBody')}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link to={withFixtureQuery('/diagnosis')} className={`${actionClass} bg-primary text-background`}>
          {t('guide.backToResult')}
        </Link>
        <Link to="/dashboard" className={`${actionClass} border border-border text-text-secondary hover:border-primary hover:text-primary`}>
          {t('nav.dashboard')}
        </Link>
        <Link to={nearbyHref} className={`${actionClass} border border-border text-text-secondary hover:border-primary hover:text-primary`}>
          {t('blocked.findHelp')}
        </Link>
      </div>
    </div>
  )
}
