import { useSyncExternalStore, type MouseEvent } from 'react'
import { getLocale, subscribeLocale, t } from '../i18n'

/**
 * First focusable element on every page. Moves focus to the page's
 * <main id="main-content"> without touching the URL hash, so routing is unaffected.
 */
export default function SkipLink() {
  useSyncExternalStore(subscribeLocale, getLocale, getLocale)

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById('main-content')
    if (!target) return
    event.preventDefault()
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
    target.focus()
    target.scrollIntoView({ block: 'start' })
  }

  return (
    <a href="#main-content" className="skip-link" onClick={handleClick}>
      {t('a11y.skipToMain')}
    </a>
  )
}
