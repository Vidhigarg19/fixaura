import { Component, Fragment, useSyncExternalStore, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getLocale, subscribeLocale, t } from '../i18n'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
  resetKey: number
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  useSyncExternalStore(subscribeLocale, getLocale)

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-text-primary">
      <section
        role="alert"
        className="glass-panel w-full max-w-lg rounded-2xl border border-primary/20 p-6 text-center shadow-[0_0_40px_rgba(0,245,212,0.08)] sm:p-8"
      >
        <h1 className="text-heading-lg">{t('errorBoundary.title')}</h1>
        <p className="mt-3 text-text-secondary">{t('errorBoundary.body')}</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-primary px-5 py-3 font-semibold text-background hover:brightness-110 focus-visible:outline-2 focus-visible:outline-primary"
          >
            {t('errorBoundary.tryAgain')}
          </button>
          <Link
            to="/"
            className="rounded-xl border border-primary/40 px-5 py-3 font-semibold text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
          >
            {t('errorBoundary.goHome')}
          </Link>
        </div>
      </section>
    </main>
  )
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application render error:', error, errorInfo.componentStack)
  }

  private retry = () => {
    this.setState(({ resetKey }) => ({ error: null, resetKey: resetKey + 1 }))
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback onRetry={this.retry} />
    }

    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>
  }
}
