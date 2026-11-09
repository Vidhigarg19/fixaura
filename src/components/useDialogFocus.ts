import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('aria-hidden') && el.getClientRects().length > 0,
  )
}

interface Options {
  /** Called when Escape is pressed. Omit to leave Escape unhandled. */
  onEscape?: () => void
  /** Element to focus first. Defaults to the first focusable element in the dialog. */
  initialFocus?: RefObject<HTMLElement | null>
}

/**
 * Focus management for modal dialogs and panels:
 * - moves focus into the dialog when it opens,
 * - keeps Tab / Shift+Tab inside it (the page behind is unreachable),
 * - closes on Escape when `onEscape` is given,
 * - returns focus to the element that opened it when it closes.
 */
export function useDialogFocus(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  { onEscape, initialFocus }: Options = {},
) {
  const escapeRef = useRef(onEscape)
  useEffect(() => {
    escapeRef.current = onEscape
  })

  useEffect(() => {
    if (!active) return
    const opener = document.activeElement as HTMLElement | null
    const frame = requestAnimationFrame(() => {
      const container = containerRef.current
      if (!container) return
      const target = initialFocus?.current ?? focusableIn(container)[0] ?? container
      target.focus()
    })

    const onKeyDown = (event: KeyboardEvent) => {
      const container = containerRef.current
      if (!container) return
      if (event.key === 'Escape' && escapeRef.current) {
        event.preventDefault()
        event.stopPropagation()
        escapeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusableIn(container)
      if (items.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      if (!container.contains(current)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && (current === first || current === container)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown, true)
      if (opener && opener.isConnected) opener.focus()
    }
    // initialFocus and containerRef are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
