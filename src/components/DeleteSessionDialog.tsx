import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { getLocale, subscribeLocale, t } from '../i18n'
import type { DeleteOutcome } from '../utils/deleteSessionFlow'

interface DeleteSessionDialogProps {
  /** Name shown in the dialog. Already translated or stored by the user. */
  itemLabel: string
  onCancel: () => void
  /** Runs the delete once. The dialog shows the result for offline and failed. */
  onConfirm: () => Promise<DeleteOutcome>
  /** Element to focus after closing when the trigger no longer exists (e.g. after a delete). */
  fallbackFocus?: () => HTMLElement | null
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Accessible confirmation: role="alertdialog", focus trapped inside, Escape closes,
// focus goes back to the button that opened it.
export default function DeleteSessionDialog({
  itemLabel,
  onCancel,
  onConfirm,
  fallbackFocus,
}: DeleteSessionDialogProps) {
  useSyncExternalStore(subscribeLocale, getLocale)
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<'failed' | 'offline' | null>(null)
  const pendingRef = useRef(false)

  // Remember the trigger, focus Cancel, and restore focus when the dialog closes.
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    return () => {
      const target = trigger && trigger.isConnected ? trigger : fallbackFocus?.() ?? null
      target?.focus()
    }
  }, [fallbackFocus])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRef.current) {
        event.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !dialogRef.current) return
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const confirm = async () => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setProblem(null)
    const outcome = await onConfirm()
    pendingRef.current = false
    setPending(false)
    if (outcome === 'failed' || outcome === 'offline') setProblem(outcome)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-session-title"
        aria-describedby="delete-session-body"
        onKeyDown={trapFocus}
        className="glass-panel max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-xl p-6"
      >
        <h2 id="delete-session-title" className="text-heading-md">
          {t('history.deleteDialogTitle')}
        </h2>
        <p className="mt-2 break-words text-sm font-semibold text-text-primary">{itemLabel}</p>
        <p id="delete-session-body" className="mt-2 text-sm text-text-secondary">
          {t('history.deleteDialogBody')}
        </p>
        {problem && (
          <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{problem === 'offline' ? t('history.deleteOffline') : t('history.deleteError')}</span>
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="min-h-11 flex-1 rounded-lg border border-border px-3 py-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={pending}
            aria-busy={pending}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-warning px-3 py-2 font-semibold text-background disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {pending ? t('history.deleting') : t('history.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
