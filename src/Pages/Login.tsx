import { useState, useSyncExternalStore, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import PageShell from '../components/PageShell'
import { getLocale, subscribeLocale, t } from '../i18n'
import { supabase } from '../lib/supabase'
import { authErrorMessage } from '../utils/authError'

export default function Login() {
  useSyncExternalStore(subscribeLocale, getLocale)
  const client = supabase
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  if (!client) return <Navigate to="/" replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSending(true)
    setError('')
    setMessage('')
    const { error: signInError } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    if (signInError) setError(authErrorMessage(signInError))
    else {
      setSent(true)
      setMessage(t('history.loginSent'))
    }
    setSending(false)
  }

  const signInWithGoogle = async () => {
    setSending(true)
    setError('')
    try {
      const { error: googleError } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/' },
      })
      if (googleError) setError(authErrorMessage(googleError))
    } catch (googleError) {
      setError(authErrorMessage(googleError))
    } finally {
      setSending(false)
    }
  }

  return (
    <PageShell className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass-panel w-full max-w-md rounded-xl p-6 sm:p-8">
        <h1 className="text-heading-lg">{t('history.loginTitle')}</h1>
        <p className="mt-2 text-sm text-text-secondary">{t('history.loginBody')}</p>
        {!sent ? (
          <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
            <label className="block text-sm text-text-secondary">
              {t('history.email')}
              <input
                type="email"
                required
                autoComplete="email"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-error' : undefined}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-3 text-text-primary focus-visible:outline-2 focus-visible:outline-primary"
              />
            </label>
            <button
              type="submit"
              disabled={sending}
              aria-label={sending ? t('common.loading') : t('history.sendLoginLink')}
              className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
            >
              {sending ? t('common.loading') : t('history.sendLoginLink')}
            </button>
          </form>
        ) : <p role="status" className="mt-5 text-sm text-primary">{message}</p>}
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          disabled={sending}
          aria-label={t('auth.continueWithGoogle')}
          className="mt-5 w-full rounded-xl border border-border px-4 py-3 font-semibold text-text-primary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {t('auth.continueWithGoogle')}
        </button>
        {sending && <p role="status" className="sr-only">{t('common.loading')}</p>}
        {error && <p id="login-error" role="alert" className="mt-4 break-words text-sm text-warning">{error}</p>}
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center text-sm text-text-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
          {t('history.back')}
        </Link>
      </div>
    </PageShell>
  )
}
