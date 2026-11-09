import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Mic, Send, Sparkles, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { getLocale, subscribeLocale, t } from '../i18n'
import { addMessage, getMessages, type HistoryMessage } from '../services/historyService'
import { askAssistant } from '../services/assistantService'
import { fromHistoryMessage, useAssistant, type AssistantMessage } from './assistantContext'
import { useDialogFocus } from './useDialogFocus'

type VoiceState = 'idle' | 'listening' | 'error'
type QuickPrompt = { key: string; label: string }

const generalPrompts: QuickPrompt[] = [
  { key: 'assistant.chips.general.work', label: 'assistant.chips.general.work' },
  { key: 'assistant.chips.general.repairs', label: 'assistant.chips.general.repairs' },
  { key: 'assistant.chips.general.safety', label: 'assistant.chips.general.safety' },
]

const repairPrompts: QuickPrompt[] = [
  { key: 'assistant.chips.repair.explain', label: 'assistant.chips.repair.explain' },
  { key: 'assistant.chips.repair.why', label: 'assistant.chips.repair.why' },
  { key: 'assistant.chips.repair.safe', label: 'assistant.chips.repair.safe' },
  { key: 'assistant.chips.repair.troubleshoot', label: 'assistant.chips.repair.troubleshoot' },
  { key: 'assistant.chips.repair.tools', label: 'assistant.chips.repair.tools' },
]

function isHistoryMessage(message: AssistantMessage): message is HistoryMessage {
  return 'session_id' in message && 'user_id' in message
}

function storedMessage(message: AssistantMessage, sessionId: string): HistoryMessage {
  if (isHistoryMessage(message)) return message
  return {
    ...message,
    session_id: sessionId,
    user_id: '',
  }
}

export default function AssistantWidget() {
  const location = useLocation()
  useSyncExternalStore(subscribeLocale, getLocale)
  const reduceMotion = useReducedMotion()

  const {
    isOpen,
    setIsOpen,
    messages,
    setMessages,
    appendMessage,
    clearMessages,
    mockMode,
    setMockMode,
    repairContext,
    user,
  } = useAssistant()
  const [draft, setDraft] = useState('')
  const [interim, setInterim] = useState('')
  const [thinking, setThinking] = useState(false)
  const [persistenceWarning, setPersistenceWarning] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [voiceError, setVoiceError] = useState('')
  const [supported] = useState(
    () => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  )
  const triggerRef = useRef<HTMLButtonElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const loadedSessionIds = useRef(new Set<string>())
  const loadingSessionIds = useRef(new Set<string>())
  const baseDraftRef = useRef('')
  const locale = getLocale()
  const hidden = location.pathname === '/login' || location.pathname === '/signup'
  // Step chips and "Step X of Y" only appear when there is a real step to talk about.
  const stepContext = location.pathname === '/guide' && repairContext?.currentStep ? repairContext : null
  const prompts = stepContext ? repairPrompts : generalPrompts
  const sessionId = user && repairContext?.sessionId ? repairContext.sessionId : null

  useEffect(() => {
    if (!user) {
      loadedSessionIds.current.clear()
      loadingSessionIds.current.clear()
    }
  }, [user])

  const closePanel = useCallback(() => {
    setIsOpen(false)
    setVoiceState('idle')
    setInterim('')
    triggerRef.current?.focus()
  }, [setIsOpen])

  const stopVoice = useCallback(() => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.stop()
      } catch (error) {
        console.warn('Unable to stop assistant voice input:', error)
      }
    }
  }, [])

  useEffect(() => {
    if (isOpen) return
    stopVoice()
  }, [isOpen, stopVoice])

  useEffect(() => () => stopVoice(), [stopVoice])

  useEffect(() => {
    if (!isOpen || !sessionId || !user || loadedSessionIds.current.has(sessionId) ||
      loadingSessionIds.current.has(sessionId)) return

    let active = true
    loadingSessionIds.current.add(sessionId)
    void getMessages(sessionId)
      .then((savedMessages) => {
        if (!active) return
        loadedSessionIds.current.add(sessionId)
        const saved = savedMessages.map(fromHistoryMessage)
        setMessages((current) => {
          const combined = new Map(current.map((message) => [message.id, message]))
          saved.forEach((message) => combined.set(message.id, message))
          return [...combined.values()].sort((first, second) =>
            first.created_at.localeCompare(second.created_at)
          )
        })
      })
      .catch((error: unknown) => {
        if (active) {
          console.warn('Unable to load assistant conversation:', error)
          setPersistenceWarning(true)
        }
      })
      .finally(() => {
        loadingSessionIds.current.delete(sessionId)
      })
    return () => {
      active = false
    }
  }, [isOpen, sessionId, user, setMessages])

  useEffect(() => {
    const list = messageListRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, thinking, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closePanel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closePanel])

  // Focus moves into the panel (to the message box), Tab stays inside, and focus returns to the opener on close.
  useDialogFocus(isOpen && !hidden, panelRef, { initialFocus: textareaRef })

  const persist = useCallback(async (message: AssistantMessage) => {
    if (!sessionId || !user) return
    try {
      const saved = await addMessage(sessionId, message.role, message.content)
      if (!saved) throw new Error('Assistant message was not saved')
      setMessages((current) => current.map((item) =>
        item.id === message.id ? fromHistoryMessage(saved) : item
      ))
    } catch (error) {
      console.warn('Unable to save assistant conversation:', error)
      setPersistenceWarning(true)
    }
  }, [sessionId, user, setMessages])

  const send = useCallback(async (value: string) => {
    const text = value.trim()
    if (!text || thinking) return
    setDraft('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setInterim('')
    setVoiceError('')
    setVoiceState('idle')
    const userMessage = appendMessage('user', text)
    void persist(userMessage)
    setThinking(true)
    try {
      const reply = await askAssistant({
        message: text,
        history: messages.map((message) => storedMessage(message, sessionId ?? '')),
        context: repairContext,
        locale,
      })
      setMockMode(reply.mock)
      const assistantMessage = appendMessage('assistant', reply.text)
      void persist(assistantMessage)
    } catch (error) {
      console.error('Assistant reply failed:', error)
      const assistantMessage = appendMessage('assistant', t('assistant.reply.fallback', locale))
      void persist(assistantMessage)
    } finally {
      setThinking(false)
    }
  }, [thinking, appendMessage, sessionId, persist, messages, repairContext, locale, setMockMode])

  const sendDraft = () => {
    void send(draft)
  }

  const handleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget
    setDraft(textarea.value)
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 112)}px`
  }

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendDraft()
    }
  }

  const toggleVoice = () => {
    if (voiceState === 'listening') {
      stopVoice()
      setVoiceState('idle')
      setInterim('')
      return
    }

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) return
    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = locale === 'hi' ? 'hi-IN' : 'en-IN'
    baseDraftRef.current = draft.trim()
    setVoiceError('')
    setVoiceState('listening')
    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result?.[0]?.transcript ?? ''
        if (result?.isFinal) finalText += transcript
        else interimText += transcript
      }
      if (finalText) {
        setDraft([baseDraftRef.current, finalText.trim()].filter(Boolean).join(' '))
        setInterim('')
      } else {
        setInterim(interimText)
      }
    }
    recognition.onerror = (event) => {
      const errorKey = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'assistant.voice.permission'
        : event.error === 'no-speech'
          ? 'assistant.voice.noSpeech'
          : event.error === 'network'
            ? 'assistant.voice.network'
            : 'assistant.voice.generic'
      setVoiceError(t(errorKey))
      setVoiceState('error')
      setInterim('')
      recognitionRef.current = null
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setVoiceState((current) => current === 'listening' ? 'idle' : current)
      setInterim('')
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch (error) {
      console.error('Unable to start assistant voice input:', error)
      recognitionRef.current = null
      setVoiceError(t('assistant.voice.generic'))
      setVoiceState('error')
    }
  }

  const beginNewChat = () => {
    clearMessages()
    setDraft('')
    setInterim('')
    setVoiceError('')
    setVoiceState('idle')
    stopVoice()
    setPersistenceWarning(false)
    if (sessionId) loadedSessionIds.current.add(sessionId)
  }

  if (hidden) return null

  const contextLine = stepContext
    ? t('assistant.contextLine')
      .replace('{issue}', stepContext.issueName)
      .replace('{step}', String(stepContext.currentStepIndex + 1))
      .replace('{total}', String(stepContext.totalSteps))
    : ''

  return (
    <>
      <motion.button
        ref={triggerRef}
        type="button"
        aria-label={t('assistant.open')}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        whileHover={reduceMotion ? undefined : { scale: 1.05 }}
        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
        className={`fixed right-[max(1.25rem,env(safe-area-inset-right))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-background shadow-[0_0_30px_rgba(0,245,212,0.42)] transition focus-visible:outline-2 focus-visible:outline-primary ${
          location.pathname === '/guide'
            ? 'bottom-[calc(6rem+env(safe-area-inset-bottom))]'
            : 'bottom-[max(1.25rem,env(safe-area-inset-bottom))]'
        }`}
      >
        <span aria-hidden="true">
          <Sparkles className="h-6 w-6" />
        </span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('assistant.title')}
            initial={reduceMotion ? false : { opacity: 0, x: 32, y: 8 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 32, y: 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: 'easeOut' }}
            className="fixed inset-x-0 bottom-0 z-30 flex h-[85dvh] flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] rounded-t-2xl border border-border glass-panel md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[400px] md:rounded-none md:border-y-0 md:border-r-0"
          >
            <header className="flex items-center justify-between gap-3 border-b border-border p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="break-words font-semibold text-text-primary">{t('assistant.title')}</h2>
                  {mockMode && (
                    <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {t('assistant.demoBadge')}
                    </span>
                  )}
                </div>
                {contextLine && (
                  <p className="mt-1 break-words text-xs text-text-subtle">{contextLine}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                <button
                  type="button"
                  aria-label={t('assistant.newChat')}
                  onClick={beginNewChat}
                  className="min-h-11 rounded-lg px-3 py-2 text-xs text-text-secondary hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {t('assistant.newChat')}
                </button>
                <button
                  type="button"
                  aria-label={t('assistant.close')}
                  onClick={closePanel}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-text-secondary hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div
              ref={messageListRef}
              aria-live="polite"
              aria-relevant="additions text"
              className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
            >
              {!messages.length && !thinking && (
                <p className="rounded-2xl rounded-tl-sm bg-surface-high/80 p-3 text-sm text-text-secondary">
                  {t('assistant.welcome')}
                </p>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <p
                    className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl p-3 text-sm ${
                      message.role === 'user'
                        ? 'rounded-br-sm bg-primary text-background'
                        : 'glass-panel rounded-bl-sm text-text-secondary'
                    }`}
                  >
                    {message.content}
                  </p>
                </div>
              ))}
              {thinking && (
                <div className="flex justify-start" role="status" aria-label={t('assistant.thinking')}>
                  <div className="glass-panel flex items-center gap-1 rounded-2xl rounded-bl-sm px-4 py-3">
                    <span className="sr-only">{t('assistant.thinking')}</span>
                    {[0, 1, 2].map((dot) => (
                      <motion.span
                        key={dot}
                        className="h-1.5 w-1.5 rounded-full bg-primary"
                        animate={reduceMotion ? { opacity: 1 } : { opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
                        transition={reduceMotion ? { duration: 0 } : { duration: 0.8, repeat: Infinity, delay: dot * 0.12 }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {persistenceWarning && (
              <p role="status" className="px-4 pb-2 text-xs text-warning">
                {t('assistant.persistenceWarning')}
              </p>
            )}

            <div className="border-t border-border p-3">
              <div className="mb-3 flex flex-wrap gap-2">
                {prompts.map((prompt) => (
                  <button
                    key={prompt.key}
                    type="button"
                    onClick={() => void send(t(prompt.label))}
                    disabled={thinking}
                    className="min-h-11 max-w-full rounded-full border border-primary/25 bg-primary/5 px-3 py-2 text-left text-xs text-primary transition hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                  >
                    {t(prompt.label)}
                  </button>
                ))}
              </div>
              {!supported && (
                <p className="mb-2 text-xs text-text-subtle">{t('assistant.voice.unsupported')}</p>
              )}
              {voiceState === 'listening' && (
                <p className="mb-2 flex items-center gap-2 text-xs text-primary" role="status">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  {t('assistant.voice.listening')}
                </p>
              )}
              {voiceError && <p role="alert" className="mb-2 text-xs text-warning">{voiceError}</p>}
              <div className="flex items-end gap-2 rounded-2xl border border-border bg-background/70 p-2">
                {supported && (
                  <button
                    type="button"
                    aria-label={voiceState === 'listening' ? t('assistant.voice.stop') : t('assistant.voice.start')}
                    aria-pressed={voiceState === 'listening'}
                    onClick={toggleVoice}
                    className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary ${
                      voiceState === 'listening' ? 'ring-2 ring-primary' : ''
                    }`}
                  >
                    <Mic className="h-5 w-5" aria-hidden="true" />
                    {voiceState === 'listening' && !reduceMotion && (
                      <motion.span
                        aria-hidden="true"
                        className="absolute inset-0 rounded-full border border-primary"
                        animate={{ scale: [1, 1.4], opacity: [0.7, 0] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                    )}
                  </button>
                )}
                <textarea
                  ref={textareaRef}
                  value={`${draft}${interim ? `${draft ? ' ' : ''}${interim}` : ''}`}
                  onChange={handleTextareaChange}
                  onKeyDown={handleTextareaKeyDown}
                  rows={1}
                  aria-label={t('assistant.inputLabel')}
                  placeholder={t('assistant.placeholder')}
                  className="max-h-28 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-text-primary placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-primary"
                />
                <button
                  type="button"
                  aria-label={t('assistant.send')}
                  onClick={sendDraft}
                  disabled={!draft.trim() || thinking}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-background transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <span className="sr-only">{t('assistant.keyboardHelp')}</span>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
