import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { t } from '../i18n'

interface SafetyBubbleProps {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel?: () => void
}

export default function SafetyBubble({
  open,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}: SafetyBubbleProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-warning/40 bg-surface p-6 shadow-glow-amber"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-warning/15 p-3 text-warning">
                <AlertTriangle className="h-6 w-6" aria-hidden />
              </div>
              <div className="flex-1">
                <h3 className="text-heading-md text-text-primary mb-2">
                  {title ?? t('safety.genericTitle')}
                </h3>
                <p className="text-body-md text-text-secondary">{message}</p>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              {onCancel && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onCancel}
                  className="flex-1 rounded-xl border border-border py-3 text-text-secondary"
                >
                  {cancelText ?? t('common.cancel')}
                </motion.button>
              )}
              <motion.button
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={onConfirm}
                className="flex-1 rounded-xl bg-warning/20 border border-warning/50 py-3 font-semibold text-warning"
              >
                {confirmText ?? t('safety.genericConfirm')}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
