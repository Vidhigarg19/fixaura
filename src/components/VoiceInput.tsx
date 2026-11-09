import { motion, useReducedMotion } from 'framer-motion'
import { Mic, MicOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getLocale, subscribeLocale, t } from '../i18n'

interface VoiceInputProps {
  onCommand: (transcript: string) => void
  className?: string
}

type VoiceProblem = 'permission' | 'noSpeech' | 'network' | 'generic' | null

function problemFromError(code: string | undefined): VoiceProblem {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission'
    case 'no-speech':
      return 'noSpeech'
    case 'network':
      return 'network'
    case 'aborted':
      return null
    default:
      return 'generic'
  }
}

export default function VoiceInput({ onCommand, className = '' }: VoiceInputProps) {
  useSyncExternalStore(subscribeLocale, getLocale, getLocale)
  const reduceMotion = useReducedMotion()
  const [listening, setListening] = useState(false)
  const [problem, setProblem] = useState<VoiceProblem>(null)
  const [supported] = useState(
    () =>
      typeof window !== 'undefined' &&
      Boolean(
        (
          window as unknown as {
            SpeechRecognition?: unknown
            webkitSpeechRecognition?: unknown
          }
        ).SpeechRecognition ||
          (
            window as unknown as {
              webkitSpeechRecognition?: unknown
            }
          ).webkitSpeechRecognition
      )
  )
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    const SR =
      window.SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition })
      .webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = false
    // Voice commands are matched against English keywords, so recognition stays English.
    rec.lang = 'en-US'
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0]?.[0]?.transcript?.toLowerCase() ?? ''
      onCommand(text)
      setListening(false)
    }
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setProblem(problemFromError(e.error))
      setListening(false)
    }
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    // Stop this instance before a new one replaces it and on unmount, so
    // leaving the page never leaves the microphone listening.
    return () => {
      rec.onresult = null
      rec.onerror = null
      rec.onend = null
      try {
        rec.stop()
      } catch {
        // Not started: nothing to stop.
      }
      if (recognitionRef.current === rec) recognitionRef.current = null
      setListening(false)
    }
  }, [onCommand])

  const toggle = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) {
      rec.stop()
      setListening(false)
    } else {
      setProblem(null)
      try {
        rec.start()
        setListening(true)
      } catch {
        setProblem('generic')
        setListening(false)
      }
    }
  }, [listening])

  // Voice is optional. Without it, the on-screen buttons remain the way to act.
  if (!supported) {
    return (
      <p className="max-w-[16rem] break-words text-xs text-text-secondary">
        {t('voice.unsupportedShort')}
      </p>
    )
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <motion.button
        type="button"
        whileHover={reduceMotion ? undefined : { scale: 1.03 }}
        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
        onClick={toggle}
        aria-label={t('voice.tapToSpeak')}
        aria-pressed={listening}
        className={`relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-3 glass-panel border border-border focus-visible:outline-2 focus-visible:outline-primary ${className}`}
      >
        {listening ? (
          <>
            <Mic className="h-5 w-5 text-primary" aria-hidden="true" />
            {!reduceMotion && (
              <motion.span
                className="absolute inset-0 rounded-full border-2 border-primary"
                animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
                aria-hidden="true"
              />
            )}
          </>
        ) : (
          <MicOff className="h-5 w-5 text-text-subtle" aria-hidden="true" />
        )}
      </motion.button>
      <span role="status" aria-live="polite" className={listening ? 'text-xs text-primary' : 'sr-only'}>
        {listening ? t('voice.listening') : ''}
      </span>
      {problem && (
        <p role="alert" className="max-w-[16rem] break-words text-right text-xs text-warning">
          {t(problem === 'permission' ? 'assistant.voice.permission' : `assistant.voice.${problem}`)}
        </p>
      )}
    </div>
  )
}
