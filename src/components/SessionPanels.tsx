import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ImagePlus, LogIn, WifiOff } from 'lucide-react'
import { getLocale, subscribeLocale, t } from '../i18n'
import PageShell from './PageShell'
import SafetyBlockedPanel from './SafetyBlockedPanel'
import GuideUnavailablePanel from './GuideUnavailablePanel'
import DeleteSessionDialog from './DeleteSessionDialog'
import { useAuth } from './authContext'
import { deleteSession } from '../services/historyService'
import { createDeleteFlow, type DeleteOutcome } from '../utils/deleteSessionFlow'
import { saveCaptureDraft } from '../utils/captureDraft'
import { buildDiagnosisView } from '../utils/diagnosisView'
import { useSessionLoader, type SessionLoaderState } from '../utils/useSessionLoader'
import FixtureBannerSlot from './FixtureBannerSlot'
import { loadSessionFixtures } from '../config/devFixtures'

export function SessionFixtureBanner({ name }: { name: string | null }) {
  if (!name) return null
  return <FixtureBannerSlot name={name} />
}

const actionClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const primaryAction = `${actionClass} bg-primary text-background`
const secondaryAction = `${actionClass} border border-border text-text-secondary hover:border-primary hover:text-primary`

/** Loading placeholder with NO session content (no title, description or diagnosis). */
export function SessionSkeleton() {
  useSyncExternalStore(subscribeLocale, getLocale)
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="glass-panel w-full animate-pulse rounded-2xl p-6">
      <div className="mb-4 h-6 w-2/3 rounded bg-surface-high" />
      <div className="mb-3 h-3 w-full rounded bg-surface-high" />
      <div className="mb-3 h-3 w-5/6 rounded bg-surface-high" />
      <div className="h-3 w-1/2 rounded bg-surface-high" />
      <span className="sr-only">{t('session.loading')}</span>
    </div>
  )
}

function MessagePanel({
  icon,
  title,
  body,
  role = 'status',
  children,
}: {
  icon?: ReactNode
  title: string
  body: string
  role?: 'status' | 'alert'
  children?: ReactNode
}) {
  return (
    <div role={role} aria-live={role === 'alert' ? 'assertive' : 'polite'} className="glass-panel rounded-xl p-5">
      <div className="flex items-start gap-3">
        {icon}
        <div className="min-w-0">
          <h1 className="text-heading-md text-text-primary">{title}</h1>
          <p className="mt-2 text-sm text-text-secondary">{body}</p>
        </div>
      </div>
      {children && <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">{children}</div>}
    </div>
  )
}

/** Sign-in prompt. Uses the same navigation state as ProtectedRoute: { from: location }. */
export function SignInToOpenPanel() {
  useSyncExternalStore(subscribeLocale, getLocale)
  const location = useLocation()
  return (
    <MessagePanel
      icon={<LogIn className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />}
      title={t('session.signInTitle')}
      body={t('session.signInBody')}
    >
      <Link to="/login" state={{ from: location }} className={primaryAction}>
        {t('nav.logIn')}
      </Link>
    </MessagePanel>
  )
}

/**
 * Every state except `ready`. Returns null for `ready` so the page renders it.
 * Missing, deleted and other-user sessions share one not-found message.
 */
export function SessionStatePanel({ state }: { state: SessionLoaderState }) {
  useSyncExternalStore(subscribeLocale, getLocale)
  switch (state.status) {
    case 'auth_loading':
    case 'loading':
      return <SessionSkeleton />
    case 'signed_out':
      return <SignInToOpenPanel />
    case 'not_found':
      return (
        <MessagePanel title={t('session.notFoundTitle')} body={t('session.notFoundBody')}>
          <Link to="/history" className={primaryAction}>
            {t('session.backToHistory')}
          </Link>
          <Link to="/capture" className={secondaryAction}>
            {t('session.scanAgain')}
          </Link>
        </MessagePanel>
      )
    case 'offline':
      return (
        <MessagePanel
          role="alert"
          icon={<WifiOff className="mt-1 h-6 w-6 shrink-0 text-warning" aria-hidden="true" />}
          title={t('session.offlineTitle')}
          body={t('session.offlineBody')}
        >
          <button type="button" onClick={state.retry} className={primaryAction}>
            {t('common.retry')}
          </button>
        </MessagePanel>
      )
    case 'error':
      return (
        <MessagePanel
          role="alert"
          icon={<AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-warning" aria-hidden="true" />}
          title={t('session.errorTitle')}
          body={t('session.errorBody')}
        >
          <button type="button" onClick={state.retry} className={primaryAction}>
            {t('common.retry')}
          </button>
        </MessagePanel>
      )
    default:
      return null
  }
}

/** Older rows saved without a diagnosis: no made-up title, only delete or scan again. */
export function LegacySessionPanel({ sessionId, isFixture }: { sessionId: string; isFixture: boolean }) {
  useSyncExternalStore(subscribeLocale, getLocale)
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [flow] = useState(() =>
    createDeleteFlow(async (id) => {
      if (loadSessionFixtures && isFixture) {
        return (await loadSessionFixtures()).fixtureDelete()
      }
      return deleteSession(id)
    })
  )
  const confirmDelete = useCallback(async (): Promise<DeleteOutcome> => {
    const outcome = await flow.run(sessionId)
    if (outcome === 'deleted') {
      setConfirming(false)
      navigate('/history', { replace: true })
    }
    return outcome
  }, [flow, navigate, sessionId])

  return (
    <>
      <MessagePanel title={t('session.legacyTitle')} body={t('session.legacyBody')}>
        <button type="button" onClick={() => setConfirming(true)} className={secondaryAction}>
          {t('history.delete')}
        </button>
        <Link to="/capture" className={primaryAction}>
          {t('session.scanAgain')}
        </Link>
      </MessagePanel>
      {confirming && (
        <DeleteSessionDialog
          itemLabel={t('history.legacyCardTitle')}
          onCancel={() => setConfirming(false)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  )
}

/** Shown when the loaded session has no stored photo (every real session today). */
export function MissingPhotoNotice({ description, isFixture }: { description: string; isFixture: boolean }) {
  useSyncExternalStore(subscribeLocale, getLocale)
  const navigate = useNavigate()
  const { user } = useAuth()
  const addAgain = () => {
    // Fixture mode never writes anything, not even the local draft.
    if (!isFixture && user) saveCaptureDraft(user.id, description)
    navigate('/capture')
  }
  return (
    <div role="note" className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-surface/60 p-4 sm:flex-row sm:items-center">
      <ImagePlus className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
      <p className="flex-1 text-sm text-text-secondary">{t('session.photoMissing')}</p>
      <button type="button" onClick={addAgain} className={secondaryAction}>
        {t('session.addPhotoAgain')}
      </button>
    </div>
  )
}

/**
 * /tools?session and /guide?session. Loads first, then:
 * - blocked session: the V04 blocked panel, no tools or steps
 * - older row without details: the legacy panel
 * - anything else: the V05 "not available" panel (no approved guide exists).
 * Step restore and progress saving are deferred until approved steps exist.
 */
export function SessionRepairGate() {
  useSyncExternalStore(subscribeLocale, getLocale)
  const { state, sessionId, fixtureName } = useSessionLoader()
  let content: ReactNode
  if (state.status !== 'ready') {
    content = <SessionStatePanel state={state} />
  } else if (!state.view.diagnosis) {
    content = <LegacySessionPanel sessionId={state.view.id} isFixture={fixtureName !== null} />
  } else {
    const gate = buildDiagnosisView(state.view.diagnosis, null)
    content =
      gate.decision === 'professional' || gate.decision === 'emergency' ? (
        <SafetyBlockedPanel
          decision={gate.decision}
          issueName={state.view.diagnosis.issueName}
          analysisDetails={gate.analysisDetails}
          showToolsLocked
        />
      ) : (
        <GuideUnavailablePanel issueName={state.view.diagnosis.issueName} sessionId={sessionId ?? state.view.id} />
      )
  }
  return (
    <PageShell className="pb-24">
      <div className="mx-auto max-w-lg px-4 pt-8">
        <SessionFixtureBanner name={fixtureName} />
        {content}
      </div>
    </PageShell>
  )
}
