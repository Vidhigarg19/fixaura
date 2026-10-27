import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { getLocale, setLocale, subscribeLocale, t, type Locale } from '../i18n'

interface LanguageToggleProps {
  onChange?: () => void
  className?: string
}

export default function LanguageToggle({ onChange, className = '' }: LanguageToggleProps) {
  const [locale, setLocaleState] = useState<Locale>(getLocale())
   
  useEffect(() => {
  const unsubscribe = subscribeLocale(() => setLocaleState(getLocale()))
  return () => { unsubscribe() }
}, [])

  const toggle = () => {
    const next: Locale = locale === 'en' ? 'hi' : 'en'
    setLocale(next)
    onChange?.()
  }

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={toggle}
      className={`inline-flex h-10 items-center justify-center rounded-full border border-border bg-surface px-3 text-label-bold text-text-subtle transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary ${className}`}
      aria-label={t('common.toggleLanguageAria')}
    >
      {locale === 'en' ? t('common.languageHI') : t('common.languageEN')}
    </motion.button>
  )
}