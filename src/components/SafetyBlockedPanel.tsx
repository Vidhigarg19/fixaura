import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon, Phone, ShieldAlert } from 'lucide-react'
import { getLocale, subscribeLocale, t } from '../i18n'
import type { RiskDecision } from '../utils/riskDecision'

interface SafetyBlockedPanelProps {
  decision: Extract<RiskDecision, 'professional' | 'emergency'>
  issueName?: string
  /** Raw analysis text. Shown only as a secondary, labelled line. */
  analysisDetails?: string
  /** Set on /tools and /guide to say why nothing is shown there. */
  showToolsLocked?: boolean
}

// Shown instead of tools, repair steps or the "See tools needed" button.
// There is deliberately NO "continue anyway" action, checkbox or hidden bypass.
export default function SafetyBlockedPanel({
  decision,
  issueName,
  analysisDetails,
  showToolsLocked = false,
}: SafetyBlockedPanelProps) {
  useSyncExternalStore(subscribeLocale, getLocale)
  const panelRef = useRef<HTMLDivElement>(null)
  const emergency = decision === 'emergency'
  const Icon = emergency ? AlertOctagon : ShieldAlert
  const nearbyHref = issueName
    ? `/nearby-shops?appliance=${encodeURIComponent(issueName.slice(0, 60))}`
    : '/nearby-shops'

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const actionClass =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

  return (
    <div
      ref={panelRef}
      role="alert"
      tabIndex={-1}
      className="mb-6 rounded-xl border-2 border-error/60 bg-error/10 p-5 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-6 w-6 shrink-0 text-error" aria-hidden="true" />
        <div className="min-w-0">
          <p className="mb-1 inline-block rounded-full border border-error/50 px-2 py-0.5 text-xs font-bold text-error">
            {emergency ? t('diagnosis.riskEmergency') : t('diagnosis.riskProfessional')}
          </p>
          <h2 className="text-heading-md text-text-primary">
            {emergency ? t('blocked.titleEmergency') : t('blocked.titleProfessional')}
          </h2>
          <p className="mt-2 text-sm text-text-primary">
            {emergency ? t('blocked.whyEmergency') : t('blocked.whyProfessional')}
          </p>
          {showToolsLocked && (
            <p className="mt-2 text-sm text-text-secondary">{t('blocked.toolsLocked')}</p>
          )}
          {analysisDetails && (
            <p className="mt-3 border-l-2 border-error/50 pl-3 text-sm text-text-secondary">
              <span className="font-semibold">{t('blocked.analysisDetails')}:</span> {analysisDetails}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {emergency && (
          <a href="tel:112" className={`${actionClass} bg-error text-background`}>
            <Phone className="h-4 w-4" aria-hidden="true" />
            {t('blocked.callEmergency')}
          </a>
        )}
        <Link
          to={nearbyHref}
          className={`${actionClass} ${emergency ? 'border border-error/60 text-text-primary' : 'bg-primary text-background'}`}
        >
          {t('blocked.findHelp')}
        </Link>
        <Link to="/capture" className={`${actionClass} border border-border text-text-secondary hover:border-primary hover:text-primary`}>
          {t('blocked.scanElse')}
        </Link>
        <Link to="/" className={`${actionClass} border border-border text-text-secondary hover:border-primary hover:text-primary`}>
          {t('blocked.backHome')}
        </Link>
      </div>
    </div>
  )
}
