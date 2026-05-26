import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface PageShellProps {
  children: ReactNode
  className?: string
}

export default function PageShell({ children, className = '' }: PageShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`min-h-screen bg-background text-text-primary ${className}`}
    >
      {children}
    </motion.div>
  )
}
