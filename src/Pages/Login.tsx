import { useState, useSyncExternalStore, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import PageShell from '../components/PageShell'
import { getLocale, subscribeLocale, t } from '../i18n'
import { supabase } from '../services/supabase'

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
      options: { emailRedirectTo: `${window.location.origin}/history` },
    })
    if (signInError) setError(signInError.message)
    else {
      setSent(true)
      setMessage(t('history.loginSent'))
    }
    setSending(false)
  }

  return (
    <PageShell className="flex min-h-screen items-center justify-center px-4 py-10">
      <main className="glass-panel w-full max-w-md rounded-xl p-6 sm:p-8">
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
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-3 text-text-primary focus-visible:outline-2 focus-visible:outline-primary"
              />
            </label>
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
            >
              {sending ? t('common.loading') : t('history.sendLoginLink')}
            </button>
          </form>
        ) : <p role="status" className="mt-5 text-sm text-primary">{message}</p>}
        {error && <p role="alert" className="mt-4 text-sm text-warning">{error}</p>}
        <Link to="/" className="mt-6 inline-block text-sm text-text-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
          {t('history.back')}
        </Link>
      </main>
    </PageShell>
  )
}
