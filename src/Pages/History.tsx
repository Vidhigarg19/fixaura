import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Clock3, MessageCircle, Trash2, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import PageShell from '../components/PageShell'
import { getLocale, subscribeLocale, t } from '../i18n'
import {
  deleteSession,
  getMessages,
  getSession,
  listSessions,
  type HistoryMessage,
  type HistorySession,
} from '../services/historyService'
import { saveSession } from '../services/repairSession'

const listVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
}

export default function History() {
  const navigate = useNavigate()
  const locale = useSyncExternalStore(subscribeLocale, getLocale)
  const [sessions, setSessions] = useState<HistorySession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<HistorySession | null>(null)
  const [viewing, setViewing] = useState<HistorySession | null>(null)
  const [viewMessages, setViewMessages] = useState<HistoryMessage[]>([])
  const [viewError, setViewError] = useState('')

  const load = useCallback(() => listSessions(), [])

  useEffect(() => {
    let active = true
    void load()
      .then((result) => {
        if (!active) return
        setError('')
        setSessions(result)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : t('history.loadError'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [load])

  const latestInProgress = useMemo(
    () => sessions.find((session) => session.status === 'in_progress'),
    [sessions]
  )

  const continueSession = async (id: string) => {
    setError('')
    try {
      const saved = await getSession(id)
      if (!saved) {
        setError(t('history.sessionMissing'))
        return
      }
      saveSession({
        diagnosis: saved.diagnosis,
        steps: saved.steps,
        currentStep: Math.min(saved.current_step, Math.max(saved.steps.length - 1, 0)),
        historySessionId: saved.id,
        imageDataUrl: undefined,
        completedAt: undefined,
      })
      navigate('/guide')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('history.loadError'))
    }
  }

  const openSummary = async (session: HistorySession) => {
    setViewError('')
    setViewMessages([])
    setViewing(session)
    try {
      setViewMessages(await getMessages(session.id))
    } catch (reason) {
      setViewError(reason instanceof Error ? reason.message : t('history.chatError'))
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await deleteSession(pendingDelete.id)
      setSessions((current) => current.filter((item) => item.id !== pendingDelete.id))
      setPendingDelete(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('history.deleteError'))
      setPendingDelete(null)
    }
  }

  const formattedDate = (date: string) =>
    new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(date))

  return (
    <PageShell className="min-h-screen px-4 py-8 sm:py-12">
      <main className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 rounded-lg text-sm text-text-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('history.back')}
        </Link>
        <h1 className="text-heading-lg">{t('history.title')}</h1>
        <p className="mt-2 text-text-secondary">{t('history.pickUp')}</p>
        {latestInProgress && (
          <p className="mt-3 flex items-center gap-2 text-sm text-primary">
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            {latestInProgress.issue_name}
          </p>
        )}

        {error && (
          <div role="alert" className="mt-6 rounded-xl border border-warning/40 bg-warning/5 p-4">
            <p className="text-sm text-warning">{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true)
                setError('')
                void load()
                  .then((result) => setSessions(result))
                  .catch((reason: unknown) => {
                    setError(reason instanceof Error ? reason.message : t('history.loadError'))
                  })
                  .finally(() => setLoading(false))
              }}
              className="mt-3 rounded-lg border border-warning/50 px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {loading ? (
          <div className="mt-8 space-y-4" aria-label={t('common.loading')} aria-busy="true">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="glass-panel h-36 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : !error && sessions.length === 0 ? (
          <div className="glass-panel mt-8 rounded-xl p-8 text-center">
            <h2 className="text-heading-md">{t('history.emptyTitle')}</h2>
            <p className="mt-2 text-text-secondary">{t('history.emptyBody')}</p>
            <Link
              to="/capture"
              className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-background focus-visible:outline-2 focus-visible:outline-primary"
            >
              {t('history.scanFirst')}
            </Link>
          </div>
        ) : !error && (
          <motion.ul
            variants={listVariants}
            initial="hidden"
            animate="visible"
            className="mt-8 space-y-4"
          >
            {sessions.map((session) => (
              <motion.li
                key={session.id}
                variants={cardVariants}
                className={`glass-panel rounded-xl p-4 sm:p-5 ${
                  session.id === latestInProgress?.id ? 'border border-primary/50 shadow-[0_0_24px_rgba(0,245,212,0.1)]' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-semibold">{session.issue_name}</h2>
                    <p className="mt-1 text-sm text-text-subtle">{formattedDate(session.updated_at)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(session)}
                    aria-label={`${t('history.delete')} ${session.issue_name}`}
                    className="shrink-0 rounded-lg p-2 text-text-subtle hover:text-warning focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <span className={`rounded-full px-3 py-1 ${
                    session.status === 'completed'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-warning/10 text-warning'
                  }`}>
                    {t(`history.status.${session.status}`)}
                  </span>
                  <span className="text-text-secondary">
                    {t('history.step')} {Math.min(session.current_step + 1, session.steps.length)} {t('history.of')} {session.steps.length}
                  </span>
                  <span className="inline-flex items-center gap-1 text-text-secondary">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    {session.message_count} {t('history.messages')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => session.status === 'completed'
                    ? void openSummary(session)
                    : void continueSession(session.id)}
                  className="mt-4 w-full rounded-xl bg-primary px-4 py-3 font-semibold text-background hover:brightness-110 focus-visible:outline-2 focus-visible:outline-primary sm:w-auto"
                >
                  {session.status === 'completed' ? t('history.view') : t('history.continue')}
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </main>

      <AnimatePresence>
        {pendingDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-title"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="glass-panel w-full max-w-sm rounded-xl p-6"
            >
              <h2 id="delete-title" className="text-heading-md">{t('history.confirmDelete')}</h2>
              <p className="mt-2 text-sm text-text-secondary">{pendingDelete.issue_name}</p>
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => setPendingDelete(null)} className="flex-1 rounded-lg border border-border px-3 py-2 focus-visible:outline-2 focus-visible:outline-primary">
                  {t('common.cancel')}
                </button>
                <button type="button" onClick={() => void confirmDelete()} className="flex-1 rounded-lg bg-warning px-3 py-2 font-semibold text-background focus-visible:outline-2 focus-visible:outline-primary">
                  {t('history.delete')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {viewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="summary-title"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="glass-panel max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 id="summary-title" className="text-heading-md">{viewing.issue_name}</h2>
                <button
                  type="button"
                  aria-label={t('history.close')}
                  onClick={() => setViewing(null)}
                  className="rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              <p className="mt-1 text-sm text-text-subtle">{formattedDate(viewing.created_at)}</p>
              <section className="mt-5 space-y-3">
                <h3 className="font-semibold">{t('history.diagnosis')}</h3>
                <p className="text-sm text-text-secondary">{viewing.diagnosis.summary}</p>
                <p className="text-sm text-text-secondary">{viewing.diagnosis.recommendedFix}</p>
                <h3 className="pt-2 font-semibold">{t('history.savedChat')}</h3>
                {viewError && <p role="alert" className="text-sm text-warning">{viewError}</p>}
                {!viewMessages.length && !viewError && <p className="text-sm text-text-subtle">{t('history.chatEmpty')}</p>}
                <div className="space-y-2">
                  {viewMessages.map((message) => (
                    <p key={message.id} className="rounded-lg bg-surface-high p-3 text-sm">
                      <span className="font-semibold">{t(`history.${message.role}`)}: </span>
                      {message.content}
                    </p>
                  ))}
                </div>
              </section>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PageShell>
  )
}
