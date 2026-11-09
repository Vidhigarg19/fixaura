import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Clock3, MessageCircle, ShieldAlert, Trash2, WifiOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import PageShell from '../components/PageShell'
import DeleteSessionDialog from '../components/DeleteSessionDialog'
import { useAuth } from '../components/authContext'
import { getLocale, subscribeLocale, t } from '../i18n'
import { deleteSession, listSessions } from '../services/historyService'
import { sessionHref } from '../services/sessionResume'
import { createDeleteFlow, type DeleteOutcome } from '../utils/deleteSessionFlow'
import { readFixtureName } from '../utils/fixtureGate'
import FixtureBannerSlot from '../components/FixtureBannerSlot'
import { loadSessionFixtures } from '../config/devFixtures'
import { isGuideAvailable } from '../utils/guideAvailability'
import { isNetworkError, isOffline } from '../utils/networkError'
import {
  historyLinkFor,
  statusLabelKey,
  toHistoryCard,
  type HistoryCard,
} from '../utils/sessionStatus'

const listVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
}

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; cards: HistoryCard[]; messageCountWarning: boolean }
  | { status: 'offline' }
  | { status: 'error' }

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export default function History() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale)
  const { user, loading: authLoading } = useAuth()
  const [fixtureName] = useState(readFixtureName)
  const isFixture = fixtureName !== null
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; state: ListState } | null>(null)
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set())
  const [pendingDelete, setPendingDelete] = useState<HistoryCard | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [flow] = useState(() =>
    createDeleteFlow(async (id) => {
      // Fixture mode only changes local state.
      if (loadSessionFixtures && isFixture) return (await loadSessionFixtures()).fixtureDelete()
      return deleteSession(id)
    })
  )

  // A list belongs to one user and one attempt; anything else is still loading.
  const key = `${user?.id ?? ''}|${attempt}`

  useEffect(() => {
    if (authLoading) return
    let active = true
    const run = async (): Promise<ListState> => {
      if (loadSessionFixtures && fixtureName) {
        const fixtures = await loadSessionFixtures()
        return { status: 'ready', cards: fixtures.historyFixtureRows(fixtureName).map(toHistoryCard), messageCountWarning: false }
      }
      if (isOffline()) return { status: 'offline' }
      try {
        const loaded = await listSessions()
        return {
          status: 'ready',
          cards: loaded.sessions.map(toHistoryCard),
          messageCountWarning: loaded.messageCountWarning,
        }
      } catch (error) {
        return isNetworkError(error) ? { status: 'offline' } : { status: 'error' }
      }
    }
    void run().then((state) => {
      if (active) setResult({ key, state })
    })
    return () => {
      active = false
    }
  }, [authLoading, fixtureName, key])

  const list: ListState = !result || result.key !== key ? { status: 'loading' } : result.state

  // Retry once when the connection comes back.
  const offline = list.status === 'offline'
  useEffect(() => {
    if (!offline) return
    const onOnline = () => setAttempt((value) => value + 1)
    window.addEventListener('online', onOnline, { once: true })
    return () => window.removeEventListener('online', onOnline)
  }, [offline])

  const retry = () => setAttempt((value) => value + 1)

  const cards = list.status === 'ready' ? list.cards.filter((card) => !removed.has(card.id)) : []
  const pickUp = cards.find(
    (card) => card.hasDetails && (card.status === 'in_progress' || card.status === 'guide_ready')
  )
  const guideAvailable = isGuideAvailable()

  const titleOf = (card: HistoryCard) => card.title ?? t('history.legacyCardTitle')

  const confirmDelete = useCallback(async (): Promise<DeleteOutcome> => {
    if (!pendingDelete) return 'failed'
    const id = pendingDelete.id
    const outcome = await flow.run(id)
    if (outcome === 'deleted') {
      setRemoved((current) => new Set(current).add(id))
      setPendingDelete(null)
      setAnnouncement(t('history.deleted'))
    }
    return outcome
  }, [flow, pendingDelete])

  const cancelDelete = useCallback(() => setPendingDelete(null), [])
  const focusHeading = useCallback(() => headingRef.current, [])

  const formattedDate = (date: string | null | undefined) => {
    if (!date) return '—'
    const parsedDate = new Date(date)
    if (Number.isNaN(parsedDate.getTime())) return '—'
    return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsedDate)
  }

  const linkFor = (card: HistoryCard) => {
    const target = historyLinkFor(card.status, card.hasDetails, guideAvailable)
    return { to: sessionHref(target.path, card.id, fixtureName), label: t(target.labelKey) }
  }

  return (
    <PageShell className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        {fixtureName && (
          <FixtureBannerSlot name={fixtureName} />
        )}
        <Link
          to="/"
          className={`mb-6 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-text-secondary hover:text-primary ${focusRing}`}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('history.back')}
        </Link>
        <h1 ref={headingRef} tabIndex={-1} className="text-heading-lg focus-visible:outline-none">
          {t('history.title')}
        </h1>

        {/* Announces deletes and other list changes to screen readers. */}
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>

        {list.status === 'loading' || authLoading ? (
          <div className="mt-8 space-y-4" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{t('common.loading')}</span>
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="glass-panel h-36 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : list.status === 'offline' ? (
          <div role="alert" className="mt-6 rounded-xl border border-warning/40 bg-warning/5 p-4">
            <p className="flex items-center gap-2 font-semibold text-warning">
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t('history.offlineTitle')}
            </p>
            <p className="mt-1 text-sm text-text-secondary">{t('history.offlineBody')}</p>
            <button
              type="button"
              onClick={retry}
              className={`mt-3 min-h-11 rounded-lg border border-warning/50 px-4 py-2 text-sm ${focusRing}`}
            >
              {t('common.retry')}
            </button>
          </div>
        ) : list.status === 'error' ? (
          <div role="alert" className="mt-6 rounded-xl border border-warning/40 bg-warning/5 p-4">
            <p className="text-sm text-warning">{t('history.loadError')}</p>
            <button
              type="button"
              onClick={retry}
              className={`mt-3 min-h-11 rounded-lg border border-warning/50 px-4 py-2 text-sm ${focusRing}`}
            >
              {t('common.retry')}
            </button>
          </div>
        ) : cards.length === 0 ? (
          <div className="glass-panel mt-8 rounded-xl p-8 text-center">
            <h2 className="text-heading-md">{t('history.emptyTitle')}</h2>
            <p className="mt-2 text-text-secondary">{t('history.emptyBody')}</p>
            <Link
              to="/capture"
              className={`mt-5 inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-background ${focusRing}`}
            >
              {t('history.scanFirst')}
            </Link>
          </div>
        ) : (
          <>
            {list.messageCountWarning && (
              <p role="status" className="mt-4 text-sm text-text-subtle">
                {t('history.messageCountWarning')}
              </p>
            )}

            {pickUp && (
              <section
                aria-labelledby="pick-up-title"
                className="mt-6 rounded-xl border border-primary/50 bg-primary/5 p-4 sm:p-5"
              >
                <h2 id="pick-up-title" className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Clock3 className="h-4 w-4" aria-hidden="true" />
                  {t('history.pickUpTitle')}
                </h2>
                <p className="mt-2 break-words text-lg font-semibold text-text-primary">{titleOf(pickUp)}</p>
                <p className="mt-1 text-sm text-text-secondary">{t(statusLabelKey(pickUp.status))}</p>
                <Link
                  to={linkFor(pickUp).to}
                  className={`mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 py-3 font-semibold text-background hover:brightness-110 sm:w-auto ${focusRing}`}
                >
                  {linkFor(pickUp).label}
                </Link>
              </section>
            )}

            <motion.ul variants={listVariants} initial="hidden" animate="visible" className="mt-8 space-y-4">
              {cards.map((card) => {
                const link = linkFor(card)
                const blocked = card.status === 'blocked'
                return (
                  <motion.li
                    key={card.id}
                    variants={cardVariants}
                    className={`glass-panel rounded-xl p-4 sm:p-5 ${
                      card.id === pickUp?.id ? 'border border-primary/50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="break-words text-lg font-semibold">{titleOf(card)}</h2>
                        <p className="mt-1 text-sm text-text-subtle">{formattedDate(card.updatedAt)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(card)}
                        aria-label={`${t('history.delete')} ${titleOf(card)}`}
                        className={`min-h-11 min-w-11 shrink-0 rounded-lg p-2 text-text-subtle hover:text-warning ${focusRing}`}
                      >
                        <Trash2 className="mx-auto h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${
                          blocked ? 'border-error/50 bg-error/10 font-semibold text-error' : 'border-border text-text-secondary'
                        }`}
                      >
                        {blocked && <ShieldAlert className="h-4 w-4" aria-hidden="true" />}
                        {t(statusLabelKey(card.status))}
                      </span>
                      <span className="inline-flex items-center gap-1 text-text-secondary">
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        {card.messageCount} {t('history.messages')}
                      </span>
                    </div>

                    {card.status === 'completed' && (
                      <p className="mt-2 text-sm text-text-secondary">{t('history.stepsFinishedNote')}</p>
                    )}
                    {card.comparison && (
                      <p className="mt-2 text-sm text-text-secondary">
                        <span className="font-semibold">{t('history.comparisonNote')}</span> {card.comparison}
                      </p>
                    )}

                    <Link
                      to={link.to}
                      className={`mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 py-3 font-semibold text-background hover:brightness-110 sm:w-auto ${focusRing}`}
                    >
                      {link.label}
                    </Link>
                  </motion.li>
                )
              })}
            </motion.ul>
          </>
        )}
      </div>

      {pendingDelete && (
        <DeleteSessionDialog
          itemLabel={titleOf(pendingDelete)}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
          fallbackFocus={focusHeading}
        />
      )}
    </PageShell>
  )
}
