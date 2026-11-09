import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useId, useRef, useSyncExternalStore } from 'react'
import { getLocale, subscribeLocale, t } from '../i18n'
import { useDialogFocus } from './useDialogFocus'

interface SafetyBubbleProps {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel?: () => void
}

function SafetyDialog({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}: Omit<SafetyBubbleProps, 'open'>) {
  const reduceMotion = useReducedMotion()
  const dialogRef = useRef<HTMLDivElement>(null)
  const safeButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const messageId = useId()

  // Escape does exactly what the backdrop click already does: cancel, when cancelling is allowed.
  useDialogFocus(true, dialogRef, { onEscape: onCancel, initialFocus: safeButtonRef })

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeOut' }}
        className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-warning/40 bg-surface p-6 shadow-glow-amber"
      >
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-xl bg-warning/15 p-3 text-warning">
            <AlertTriangle className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-heading-md text-text-primary mb-2 break-words">
              {title ?? t('safety.genericTitle')}
            </h2>
            <p id={messageId} className="text-body-md text-text-secondary break-words">
              {message}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 pb-[env(safe-area-inset-bottom)]">
          {onCancel && (
            <motion.button
              ref={safeButtonRef}
              type="button"
              whileHover={reduceMotion ? undefined : { scale: 1.03 }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              onClick={onCancel}
              className="min-h-11 min-w-32 flex-1 rounded-xl border border-border px-3 py-3 text-text-secondary focus-visible:outline-2 focus-visible:outline-primary"
            >
              {cancelText ?? t('common.cancel')}
            </motion.button>
          )}
          <motion.button
            ref={onCancel ? undefined : safeButtonRef}
            type="button"
            whileHover={reduceMotion ? undefined : { scale: 1.03 }}
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            onClick={onConfirm}
            className="min-h-11 min-w-32 flex-1 rounded-xl bg-warning/20 border border-warning/50 px-3 py-3 font-semibold text-warning focus-visible:outline-2 focus-visible:outline-primary"
          >
            {confirmText ?? t('safety.genericConfirm')}
          </motion.button>
        </div>
      </motion.div>
    </>
  )
}

export default function SafetyBubble({ open, ...rest }: SafetyBubbleProps) {
  useSyncExternalStore(subscribeLocale, getLocale, getLocale)
  return <AnimatePresence>{open && <SafetyDialog {...rest} />}</AnimatePresence>
}
