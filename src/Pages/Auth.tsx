
import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PageShell from '../components/PageShell'
import { getLocale, subscribeLocale, t } from '../i18n'

export default function Auth({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) {
  const navigate = useNavigate()
  useSyncExternalStore(subscribeLocale, getLocale)
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmationPending, setConfirmationPending] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate('/', { replace: true })
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setConfirmationPending(false)

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })
        if (error) throw error

        if (data.session) {
          navigate('/', { replace: true })
        } else {
          setConfirmationPending(true)
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
        if (data.session) navigate('/', { replace: true })
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    setLoading(true)
    setMessage('')
    setConfirmationPending(false)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/' },
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
            disabled={loading}
            aria-label={loading ? t('common.loading') : mode === 'signup' ? t('auth.createAccount') : t('auth.login')}
            className="w-full rounded-xl bg-primary py-3 font-semibold text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white"
          >
            {loading ? t('common.loading') : mode === 'signup' ? t('auth.createAccount') : t('auth.login')}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={loading}
          aria-label={t('auth.continueWithGoogle')}
          className="w-full rounded-xl border border-border py-3 font-semibold text-text-primary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {t('auth.continueWithGoogle')}
        </button>

        {message && (
          <p role="status" className="text-sm text-text-secondary break-words">
            {confirmationPending ? t('auth.confirmEmail') : message}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signup' ? 'login' : 'signup')
            setMessage('')
            setConfirmationPending(false)
          }}
          aria-label={mode === 'signup' ? t('auth.switchToLogin') : t('auth.switchToSignup')}
          className="w-full text-sm text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          {mode === 'signup'
            ? t('auth.switchToLogin')
            : t('auth.switchToSignup')}
        </button>

        <Link to="/" className="block text-center text-sm text-text-secondary underline focus-visible:outline-2 focus-visible:outline-primary">
          {t('auth.backHome')}
        </Link>
      </div>
    </PageShell>
  )
}
