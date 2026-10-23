import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import { ChevronDown, ChevronUp, Send } from 'lucide-react'
import { t, getLocale, subscribeLocale } from '../i18n'
import { addMessage, getMessages, type ChatRole, type HistoryMessage } from '../services/historyService'
import type { DiagnosisResult, RepairStep } from '../types/repair'

type DisplayMessage = Pick<HistoryMessage, 'id' | 'role' | 'content'>

interface FollowUpChatProps {
  sessionId?: string
  diagnosis: DiagnosisResult
  step: RepairStep
}

export default function FollowUpChat({ sessionId, diagnosis, step }: FollowUpChatProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useSyncExternalStore(subscribeLocale, getLocale)

  useEffect(() => {
    let active = true
    if (!sessionId) return
    void getMessages(sessionId)
      .then((saved) => {
        if (active) setMessages(saved)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : t('history.chatError'))
      })
    return () => {
      active = false
    }
  }, [sessionId])

  const persistMessage = async (role: ChatRole, content: string): Promise<DisplayMessage> => {
    const saved = sessionId ? await addMessage(sessionId, role, content) : null
    return saved ?? {
      id: `${role}-${Date.now()}-${Math.random()}`,
      role,
      content,
    }
  }

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const question = draft.trim()
    if (!question || loading) return
    setLoading(true)
    setError('')
    setDraft('')
    try {
      const userMessage = await persistMessage('user', question)
      setMessages((current) => [...current, userMessage])
      const response = t('history.mockReply')
      const assistantMessage = await persistMessage('assistant', response)
      setMessages((current) => [...current, assistantMessage])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('history.chatError'))
      setDraft(question)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="glass-panel rounded-xl mt-6 overflow-hidden" aria-label={t('history.chatTitle')}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 p-4 text-left focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span>
          <span className="block font-semibold">{t('history.chatTitle')}</span>
          <span className="block text-xs text-text-subtle mt-1">
            {diagnosis.issueName} · {step.title}
          </span>
        </span>
        {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
      </button>
      {open && (
        <div className="border-t border-border p-4">
          <div className="max-h-56 overflow-y-auto space-y-3 mb-4" aria-live="polite">
            {messages.map((message) => (
              <p
                key={message.id}
                className={`rounded-lg p-3 text-sm ${
                  message.role === 'user'
                    ? 'ml-6 bg-primary/10 text-text-primary'
                    : 'mr-6 bg-surface-high text-text-secondary'
                }`}
              >
                <span className="font-semibold">{t(`history.${message.role}`)}: </span>
                {message.content}
              </p>
            ))}
            {!messages.length && (
              <p className="text-sm text-text-subtle">{t('history.chatEmpty')}</p>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-warning mb-3">{error}</p>}
          <form onSubmit={(event) => void send(event)} className="flex gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('history.chatPlaceholder')}
              aria-label={t('history.chatPlaceholder')}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
            />
            <button
              type="submit"
              disabled={loading || !draft.trim()}
              aria-label={t('history.sendMessage')}
              className="rounded-lg bg-primary p-3 text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </section>
  )
}
