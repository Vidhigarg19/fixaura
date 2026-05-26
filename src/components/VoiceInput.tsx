import { motion } from 'framer-motion'
import { Mic, MicOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../i18n'

interface VoiceInputProps {
  onCommand: (transcript: string) => void
  className?: string
}

export default function VoiceInput({ onCommand, className = '' }: VoiceInputProps) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    const SR =
      window.SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition
    if (!SR) {
      setSupported(false)
      return
    }
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0]?.[0]?.transcript?.toLowerCase() ?? ''
      onCommand(text)
      setListening(false)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
  }, [onCommand])

  const toggle = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) {
      rec.stop()
      setListening(false)
    } else {
      rec.start()
      setListening(true)
    }
  }, [listening])

  if (!supported) return null

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={toggle}
      aria-label={t('voice.tapToSpeak')}
      aria-pressed={listening}
      className={`relative rounded-full p-3 glass-panel border border-border ${className}`}
    >
      {listening ? (
        <>
          <Mic className="h-5 w-5 text-primary" />
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-primary"
            animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        </>
      ) : (
        <MicOff className="h-5 w-5 text-text-subtle" />
      )}
      {listening && (
        <span className="sr-only">{t('voice.listening')}</span>
      )}
    </motion.button>
  )
}
