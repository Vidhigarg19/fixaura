import { useSyncExternalStore } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { getLocale, subscribeLocale, t } from '../i18n'
import type { SafetyVerdict } from '../lib/safety'
import { disclaimerKeyForVerdict } from '../lib/safety'

interface SafetyDisclaimerProps {
  /**
   * The moderation verdict for the content being shown. When it is not flagged
   * the component renders a standing, generic caution so users always see a
   * "verify before you act" reminder on AI output.
   */
  verdict?: SafetyVerdict | null
  /**
   * When true, render a stronger "caution" tone (amber) instead of the neutral
   * standing disclaimer. Blocked content should use SafetyBlockedPanel instead
   * of this component.
   */
  tone?: 'info' | 'caution'
  className?: string
}

// A non-blocking inline banner. For professional/emergency ("blocked") content
// use SafetyBlockedPanel, which replaces the repair UI entirely. This component
// is only for caution-level findings and the always-on AI disclaimer.
export default function SafetyDisclaimer({
  verdict,
  tone = 'info',
  className = '',
}: SafetyDisclaimerProps) {
  useSyncExternalStore(subscribeLocale, getLocale)

  const flagged = verdict?.flagged ?? false
  const disclaimerKey = verdict ? disclaimerKeyForVerdict(verdict) : null
  const effectiveTone = flagged ? 'caution' : tone

  const bodyKey = disclaimerKey ?? 'safetyPolicy.disclaimer.generic'
  const Icon = effectiveTone === 'caution' ? AlertTriangle : Info
  const toneClass =
    effectiveTone === 'caution'
      ? 'border-warning/50 bg-warning/10 text-text-primary'
      : 'border-border bg-surface-high/40 text-text-secondary'
  const iconClass = effectiveTone === 'caution' ? 'text-warning' : 'text-text-subtle'

  return (
    <div
      role="note"
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${toneClass} ${className}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconClass}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">{t('safetyPolicy.title')}</p>
        <p className="mt-1">{t(bodyKey)}</p>
        <p className="mt-1 text-text-subtle">{t('safetyPolicy.aiDisclaimer')}</p>
      </div>
    </div>
  )
}
