import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { User } from '@supabase/supabase-js'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, LogIn, Menu, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { getLocale, subscribeLocale, t } from '../i18n'
import { supabase } from '../services/supabase'
import LanguageToggle from './LanguageToggle'

type SectionId = 'features' | 'showcase' | 'testimonials'

const sectionLinks: Array<{ id: SectionId; label: string }> = [
  { id: 'features', label: 'nav.features' },
  { id: 'showcase', label: 'nav.showcase' },
  { id: 'testimonials', label: 'nav.testimonials' },
]

function sectionHref(id: SectionId, isLandingPage: boolean) {
  return isLandingPage ? `#${id}` : `/#${id}`
}

export default function Navbar() {
  const location = useLocation()
  useSyncExternalStore(subscribeLocale, getLocale)

  const [user, setUser] = useState<User | null>(null)
  const [activeSection, setActiveSection] = useState<SectionId | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)
  const accountTriggerRef = useRef<HTMLButtonElement>(null)
  const mobilePanelRef = useRef<HTMLDivElement>(null)
  const accountPanelRef = useRef<HTMLDivElement>(null)
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
    if (!supabase) return
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('Unable to check sign-in status:', error)
        return
      }
      if (active) setUser(data.session?.user ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
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
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Sign out failed:', error)
    if (mobileOpen) closeMobileMenu()
    else closeAccountMenu()
  }

  const activeLinkClass =
    'relative text-primary after:absolute after:-bottom-2 after:left-0 after:h-0.5 after:w-full after:rounded-full after:bg-primary'
  const desktopLinkClass =
    'whitespace-nowrap text-sm transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary'

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-40 border-b border-border/80 glass-panel backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 md:px-6 lg:px-8">
        <Link
          to="/"
          className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-primary sm:gap-3"
          aria-label={t('nav.home')}
        >
          <img
            src="/fixaura-logo.png"
            alt=""
            className="h-10 w-10 shrink-0 rounded-2xl object-contain"
          />
          <span className="min-w-0 leading-none">
            <span className="block whitespace-nowrap text-[18px] font-bold tracking-tight text-text-primary">
              {t('common.brandName')}
            </span>
            <span className="mt-1 hidden whitespace-nowrap text-[9px] uppercase tracking-[0.1em] text-text-subtle sm:block">
              {t('landing.footerTagline')}
            </span>
          </span>
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
          <LanguageToggle className="h-10 rounded-full px-3" />
          {user ? (
            <div className="relative">
              <button
                ref={accountTriggerRef}
                type="button"
                aria-label={t('nav.accountMenu')}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((open) => !open)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-sm font-bold text-primary transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary"
              >
                {user.email?.trim().charAt(0).toUpperCase() || t('common.brandName').charAt(0)}
              </button>
              <AnimatePresence>
                {accountOpen && (
                  <motion.div
                    ref={accountPanelRef}
                    role="menu"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-border bg-surface p-2 shadow-xl"
                  >
                    <p className="truncate px-3 py-2 text-sm text-text-subtle">{user.email ?? ''}</p>
                    <Link
                      to="/history"
                      role="menuitem"
                      onClick={closeAccountMenu}
                      className="block rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {t('history.navHistory')}
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleSignOut()}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {t('nav.signOut')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link
              to="/auth"
              className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              {t('nav.logIn')}
            </Link>
          )}
          <Link
            to="/capture"
            className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-semibold text-background shadow-[0_12px_30px_rgba(0,245,212,0.22)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-primary"
          >
            {t('nav.scan')}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <button
          ref={mobileTriggerRef}
          type="button"
          aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.openMenu')}
          aria-haspopup="menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-primary focus-visible:outline-2 focus-visible:outline-primary md:hidden"
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
            role="menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="absolute left-0 right-0 top-full max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-border bg-background/95 p-4 shadow-xl backdrop-blur-xl md:hidden"
          >
            <nav className="flex flex-col gap-1" aria-label={t('nav.mainMenu')}>
              {sectionLinks.map(({ id, label }) => (
                <a
                  key={id}
                  href={sectionHref(id, isLandingPage)}
                  role="menuitem"
                  onClick={() => {
                    setActiveSection(id)
                    closeMobileMenu()
                  }}
                  className={`rounded-lg px-3 py-3 text-sm transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary ${
                    activeSection === id ? 'bg-primary/10 text-primary' : 'text-text-primary'
                  }`}
                >
                  {t(label)}
                </a>
              ))}
              {user && (
                <Link
                  to="/history"
                  role="menuitem"
                  onClick={closeMobileMenu}
                  className={`rounded-lg px-3 py-3 text-sm transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary ${
                    location.pathname === '/history' ? 'bg-primary/10 text-primary' : 'text-text-primary'
                  }`}
                >
                  {t('history.navHistory')}
                </Link>
              )}
            </nav>
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
              <LanguageToggle className="h-10 w-fit rounded-full px-4" />
              {user ? (
                <>
                  <p className="truncate px-1 text-sm text-text-subtle">{user.email ?? ''}</p>
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="h-10 rounded-full border border-border px-4 text-left text-sm font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {t('nav.signOut')}
                  </button>
                </>
              ) : (
                <Link
                  to="/auth"
                  onClick={closeMobileMenu}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  {t('nav.logIn')}
                </Link>
              )}
              <Link
                to="/capture"
                onClick={closeMobileMenu}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-background shadow-[0_12px_30px_rgba(0,245,212,0.22)] focus-visible:outline-2 focus-visible:outline-primary"
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
