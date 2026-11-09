import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

interface PageShellProps {
  children: ReactNode
  className?: string
}

/**
 * Page wrapper and the single <main> landmark for routed pages.
 * The skip link focuses #main-content.
 */
export default function PageShell({ children, className = '' }: PageShellProps) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.main
      id="main-content"
      tabIndex={-1}
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
      transition={{ duration: reduceMotion ? 0 : 0.4, ease: 'easeOut' }}
      className={`min-h-screen bg-background text-text-primary ${className}`}
    >
      {children}
    </motion.main>
  )
}
