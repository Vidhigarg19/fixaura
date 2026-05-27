import { motion } from 'framer-motion'
import { getLocale, setLocale, t, type Locale } from '../i18n'

interface LanguageToggleProps {
  onChange?: () => void
}

export default function LanguageToggle({ onChange }: LanguageToggleProps) {
  const locale = getLocale()

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
      className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-label-bold text-text-subtle transition-colors hover:border-primary/40 hover:text-primary"
      aria-label={t('common.toggleLanguageAria')}
    >
      {locale === 'en' ? t('common.languageHI') : t('common.languageEN')}
    </motion.button>
  )
}