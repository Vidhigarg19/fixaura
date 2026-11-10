import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronRight, LogIn, Menu, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { getLocale, subscribeLocale, t } from '../i18n'
import { useAuth } from './authContext'
import LanguageToggle from './LanguageToggle'
import { BrandLockup } from './Logo'
import { clearCaptureDraft } from '../utils/captureDraft'
import { useDialogFocus } from './useDialogFocus'

type SectionId = 'features' | 'showcase' | 'why-fixaura'

const sectionLinks: Array<{ id: SectionId; label: string }> = [
  { id: 'features', label: 'nav.features' },
  { id: 'showcase', label: 'nav.showcase' },
  { id: 'why-fixaura', label: 'nav.whyFixaura' },
]

function sectionHref(id: SectionId, isLandingPage: boolean) {
  return isLandingPage ? `#${id}` : `/#${id}`
}

export default function Navbar() {
  const location = useLocation()
  const { user, signOut } = useAuth()
  useSyncExternalStore(subscribeLocale, getLocale)
  const reduceMotion = useReducedMotion()

  const [activeSection, setActiveSection] = useState<SectionId | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)
  const accountTriggerRef = useRef<HTMLButtonElement>(null)
  const mobilePanelRef = useRef<HTMLDivElement>(null)
  const accountPanelRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null)
  const isLandingPage = location.pathname === '/'

  const closeMobileMenu = useCallback(() => {
    setMobileOpen(false)
    mobileTriggerRef.current?.focus()
  }, [])

  const closeAccountMenu = useCallback(() => {
    setAccountOpen(false)
    accountTriggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!isLandingPage) return

    const updateActiveSection = () => {
      const currentHash = window.location.hash.slice(1)
      if (sectionLinks.some(({ id }) => id === currentHash)) {
        setActiveSection(currentHash as SectionId)
        return
      }

      const visibleSection = sectionLinks
        .map(({ id }) => document.getElementById(id))
        .find((section) => {
          if (!section) return false
          const { top, bottom } = section.getBoundingClientRect()
          return top <= 150 && bottom > 150
        })
      if (visibleSection?.id) setActiveSection(visibleSection.id as SectionId)
    }

    window.addEventListener('scroll', updateActiveSection, { passive: true })
    window.addEventListener('hashchange', updateActiveSection)
    return () => {
      window.removeEventListener('scroll', updateActiveSection)
      window.removeEventListener('hashchange', updateActiveSection)
    }
  }, [isLandingPage])

  // The mobile menu is hidden from the md breakpoint up; close it so the body
  // scroll lock below is released when the window is resized or rotated.
  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 768px)')
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false)
    }
    desktopQuery.addEventListener('change', handleChange)
    return () => desktopQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Node &&
        !mobilePanelRef.current?.contains(target) &&
        !mobileTriggerRef.current?.contains(target)
      ) {
        closeMobileMenu()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileMenu()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileOpen, closeMobileMenu])

  useDialogFocus(mobileOpen, headerRef, { initialFocus: firstMobileLinkRef })

  useEffect(() => {
    if (!accountOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Node &&
        !accountPanelRef.current?.contains(target) &&
        !accountTriggerRef.current?.contains(target)
      ) {
        closeAccountMenu()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAccountMenu()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [accountOpen, closeAccountMenu])

  async function handleSignOut() {
    setSigningOut(true)
    setSignOutError('')
    try {
      await signOut()
      clearCaptureDraft()
      if (mobileOpen) closeMobileMenu()
      else closeAccountMenu()
    } catch (error) {
      console.error('Sign out failed:', error)
      setSignOutError(t('nav.signOutError'))
    } finally {
      setSigningOut(false)
    }
  }

  const activeLinkClass =
    'relative text-primary after:absolute after:-bottom-2 after:left-0 after:h-0.5 after:w-full after:rounded-full after:bg-primary'
  const desktopLinkClass =
    'whitespace-nowrap text-sm transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary'

  return (
    <motion.header
      ref={headerRef}
      initial={reduceMotion ? false : { opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-40 border-b border-border/80 glass-panel backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 md:px-6 lg:px-8">
        <Link
          to="/"
          className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-primary sm:gap-3"
          aria-label={t('nav.home')}
        >
          <BrandLockup tagline={isLandingPage ? t('landing.footerTagline') : undefined} />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-6 text-text-secondary md:flex lg:gap-8" aria-label={t('nav.mainMenu')}>
          {sectionLinks.map(({ id, label }) => (
            <a
              key={id}
              href={sectionHref(id, isLandingPage)}
              onClick={() => setActiveSection(id)}
              aria-current={activeSection === id ? 'location' : undefined}
              className={`${desktopLinkClass} ${activeSection === id ? activeLinkClass : ''}`}
            >
              {t(label)}
            </a>
          ))}
          {user && (
            <Link
              to="/dashboard"
              aria-current={location.pathname === '/dashboard' ? 'page' : undefined}
              className={`${desktopLinkClass} ${
                location.pathname === '/dashboard' ? activeLinkClass : ''
              }`}
            >
              {t('nav.dashboard')}
            </Link>
          )}
          {user && (
            <Link
              to="/history"
              aria-current={location.pathname === '/history' ? 'page' : undefined}
              className={`${desktopLinkClass} ${
                location.pathname === '/history' ? activeLinkClass : ''
              }`}
            >
              {t('history.navHistory')}
            </Link>
          )}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 md:flex lg:gap-3">
          <LanguageToggle className="rounded-full px-3" />
          {user ? (
            <div className="relative">
              <button
                ref={accountTriggerRef}
                type="button"
                aria-label={t('nav.accountMenu')}
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((open) => !open)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-sm font-bold text-primary transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary"
              >
                {user.email?.trim().charAt(0).toUpperCase() || t('common.brandName').charAt(0)}
              </button>
              <AnimatePresence>
                {accountOpen && (
                  <motion.div
                    ref={accountPanelRef}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-border bg-surface p-2 shadow-xl"
                  >
                    <p className="break-all px-3 py-2 text-sm text-text-subtle">{user.email ?? ''}</p>
                    {signOutError && (
                      <p role="alert" className="px-3 py-2 text-xs text-warning">{signOutError}</p>
                    )}
                    <Link
                      to="/history"
                      onClick={closeAccountMenu}
                      className="block min-h-11 rounded-lg px-3 py-3 text-sm text-text-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {t('history.navHistory')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      disabled={signingOut}
                      className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                    >
                      {t('nav.signOut')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              {t('nav.logIn')}
            </Link>
          )}
          <Link
            to="/capture"
            className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-semibold text-background shadow-[0_12px_30px_rgba(0,245,212,0.22)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-primary"
          >
            {t('nav.scan')}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <button
          ref={mobileTriggerRef}
          type="button"
          aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.openMenu')}
          aria-haspopup="dialog"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-primary focus-visible:outline-2 focus-visible:outline-primary md:hidden"
        >
          {mobileOpen
            ? <X className="h-5 w-5" aria-hidden="true" />
            : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            ref={mobilePanelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.mobileMenu')}
            initial={reduceMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="absolute left-0 right-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))] border-b border-border bg-background/95 p-4 shadow-xl backdrop-blur-xl md:hidden"
          >
            <nav className="flex flex-col gap-1" aria-label={t('nav.mainMenu')}>
              {sectionLinks.map(({ id, label }, index) => (
                <a
                  key={id}
                  ref={index === 0 ? firstMobileLinkRef : undefined}
                  href={sectionHref(id, isLandingPage)}
                  onClick={() => {
                    setActiveSection(id)
                    closeMobileMenu()
                  }}
                  className={`rounded-lg px-3 py-3 min-h-11 text-sm transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary ${
                    activeSection === id ? 'bg-primary/10 text-primary' : 'text-text-primary'
                  }`}
                >
                  {t(label)}
                </a>
              ))}
              {user && (
                <Link
                  to="/dashboard"
                  onClick={closeMobileMenu}
                  className={`rounded-lg px-3 py-3 min-h-11 text-sm transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary ${
                    location.pathname === '/dashboard' ? 'bg-primary/10 text-primary' : 'text-text-primary'
                  }`}
                >
                  {t('nav.dashboard')}
                </Link>
              )}
              {user && (
                <Link
                  to="/history"
                  onClick={closeMobileMenu}
                  className={`rounded-lg px-3 py-3 min-h-11 text-sm transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary ${
                    location.pathname === '/history' ? 'bg-primary/10 text-primary' : 'text-text-primary'
                  }`}
                >
                  {t('history.navHistory')}
                </Link>
              )}
            </nav>
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
              <LanguageToggle className="w-fit rounded-full px-4" />
              {user ? (
                <>
                  <p className="break-all px-1 text-sm text-text-subtle">{user.email ?? ''}</p>
                  {signOutError && (
                    <p role="alert" className="px-1 text-xs text-warning">{signOutError}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={signingOut}
                    className="min-h-11 rounded-full border border-border px-4 text-left text-sm font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                  >
                    {t('nav.signOut')}
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  onClick={closeMobileMenu}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  {t('nav.logIn')}
                </Link>
              )}
              <Link
                to="/capture"
                onClick={closeMobileMenu}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-background shadow-[0_12px_30px_rgba(0,245,212,0.22)] focus-visible:outline-2 focus-visible:outline-primary"
              >
                {t('nav.scan')}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
