
import { useState, useSyncExternalStore, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../services/supabase'
import PageShell from '../components/PageShell'
import { getLocale, subscribeLocale, t } from '../i18n'

export default function Auth({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) {
  const location = useLocation()
  const client = supabase
  useSyncExternalStore(subscribeLocale, getLocale)
  const mode = initialMode
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmationPending, setConfirmationPending] = useState(false)

  const state = location.state as {
    from?: { pathname?: string; search?: string; hash?: string }
  } | null
  const protectedPath = state?.from?.pathname
  const redirectPath =
    protectedPath?.startsWith('/') && !protectedPath.startsWith('//')
      ? `${protectedPath}${state?.from?.search ?? ''}${state?.from?.hash ?? ''}`
      : '/dashboard'

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!client) {
      setMessage(t('auth.notConfigured'))
      return
    }

    setLoading(true)
    setMessage('')
    setConfirmationPending(false)

    try {
      if (mode === 'signup') {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: new URL(redirectPath, window.location.origin).toString(),
          },
        })
        if (error) throw error

        if (!data.session) setConfirmationPending(true)
      } else {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    if (!client) {
      setMessage(t('auth.notConfigured'))
      return
    }

    setLoading(true)
    setMessage('')
    setConfirmationPending(false)
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: new URL(redirectPath, window.location.origin).toString() },
      })
      if (error) throw error
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageShell className="flex items-center justify-center p-6">
      <div className="glass-panel w-full max-w-md rounded-2xl p-6 space-y-5">
        <h1 className="text-heading-lg">
          {mode === 'signup' ? t('auth.createTitle') : t('auth.welcomeTitle')}
        </h1>
        <p className="text-text-secondary text-sm">
          {mode === 'signup'
            ? t('auth.signupBody')
            : t('auth.loginBody')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm mb-2">{t('auth.email')}</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-background p-3 text-text-primary focus-visible:outline-2 focus-visible:outline-primary"
              placeholder={t('auth.emailPlaceholder')}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm mb-2">{t('auth.password')}</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-background p-3 text-text-primary focus-visible:outline-2 focus-visible:outline-primary"
              placeholder={t('auth.passwordPlaceholder')}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !client}
            aria-label={loading ? t('common.loading') : mode === 'signup' ? t('auth.createAccount') : t('auth.login')}
            className="w-full rounded-xl bg-primary py-3 font-semibold text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white"
          >
            {loading ? t('common.loading') : mode === 'signup' ? t('auth.createAccount') : t('auth.login')}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={loading || !client}
          aria-label={t('auth.continueWithGoogle')}
          className="w-full rounded-xl border border-border py-3 font-semibold text-text-primary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {t('auth.continueWithGoogle')}
        </button>

        {!client && !message && (
          <p role="alert" className="text-sm text-warning">{t('auth.notConfigured')}</p>
        )}
        {message && (
          <p
            role={confirmationPending ? 'status' : 'alert'}
            className="text-sm text-text-secondary break-words"
          >
            {confirmationPending ? t('auth.confirmEmail') : message}
          </p>
        )}

        <Link
          to={mode === 'signup' ? '/login' : '/signup'}
          state={location.state}
          className="block w-full text-center text-sm text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          {mode === 'signup'
            ? t('auth.switchToLogin')
            : t('auth.switchToSignup')}
        </Link>

        <Link to="/" className="block text-center text-sm text-text-secondary underline focus-visible:outline-2 focus-visible:outline-primary">
          {t('auth.backHome')}
        </Link>
      </div>
    </PageShell>
  )
}
