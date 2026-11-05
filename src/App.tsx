import { Suspense, lazy, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Wrench } from 'lucide-react'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './components/AuthProvider'
import { useAuth } from './components/authContext'
import AssistantProvider from './components/AssistantProvider'
import AssistantWidget from './components/AssistantWidget'
import { getLocale, subscribeLocale } from './i18n'
import { testSupabaseConnection } from './lib/test-supabase'
import { getSession as getRepairSession, isValidDiagnosisSession } from './services/repairSession'

const Landing = lazy(() => import('./Pages/Landing'))
const Dashboard = lazy(() => import('./Pages/Dashboard'))
const CameraCapture = lazy(() => import('./Pages/CameraCapture'))
const Auth = lazy(() => import('./Pages/Auth'))
const Diagnosis = lazy(() => import('./Pages/Diagnosis'))
const DiagnosisHistory = lazy(() => import('./Pages/DiagnosisHistory'))
const ToolChecklist = lazy(() => import('./Pages/ToolChecklist'))
const RepairGuide = lazy(() => import('./Pages/RepairGuide'))
const Verify = lazy(() => import('./Pages/Verify'))
const Completion = lazy(() => import('./Pages/Completion'))
const History = lazy(() => import('./Pages/History'))
const NearbyShops = lazy(() => import('./Pages/NearbyShops'))

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#041329] flex flex-col items-center justify-center gap-6">
      <div className="relative flex items-center justify-center">
        <div className="h-20 w-20 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        <div className="absolute h-14 w-14 rounded-full border border-primary/10 border-t-primary/40 animate-[spin_1.5s_linear_infinite_reverse]" />
        <div className="absolute flex h-10 w-10 items-center justify-center">
          <Logo size={40} alt="FixAura logo" />
        </div>
      </div>
      <p className="text-[12px] uppercase tracking-[0.26em] text-primary/60 font-semibold animate-pulse">
        FixAura
      </p>
    </div>
  )
}

function AppLayout() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  )
}

function LandingLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  )
}

function AuthenticationError() {
  const { error } = useAuth()
  useSyncExternalStore(subscribeLocale, getLocale)

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="glass-panel max-w-lg rounded-2xl p-6 text-center">
        <h1 className="text-xl font-semibold">{t('auth.sessionCheckFailed')}</h1>
        <p role="alert" className="mt-3 break-words text-sm text-text-secondary">
          {error}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-xl bg-primary px-5 py-3 font-semibold text-background"
        >
          {t('common.retry')}
        </button>
      </div>
    </main>
  )
}

function ProtectedRoute() {
  const { user, loading, error } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader />
  if (error) return <AuthenticationError />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />

  return (
    <>
      <Navbar />
      <Outlet />
      <AssistantWidget />
    </>
  )
}

function GuestRoute({ signup = false }: { signup?: boolean }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader />
  if (user) {
    const state = location.state as {
      from?: { pathname?: string; search?: string; hash?: string }
    } | null
    const path = state?.from?.pathname
    const destination =
      path?.startsWith('/') && !path.startsWith('//')
        ? `${path}${state?.from?.search ?? ''}${state?.from?.hash ?? ''}`
        : '/dashboard'
    return <Navigate to={destination} replace />
  }

  return <Auth initialMode={signup ? 'signup' : 'login'} />
}

function AppRoutes() {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      >
        <Suspense fallback={<PageLoader />}>
          <Routes location={location}>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<AuthRedirect><Auth /></AuthRedirect>} />
            <Route path="/signup" element={<AuthRedirect><Auth initialMode="signup" /></AuthRedirect>} />
            <Route path="/diagnosis-history" element={<DiagnosisHistory />} />
            <Route path="/capture" element={<CameraCapture />} />
            <Route path="/diagnosis" element={<Diagnosis />} />
            <Route path="/nearby-shops" element={<NearbyShops />} />
            <Route path="/tools" element={<ToolChecklist />} />
            <Route path="/guide" element={<RepairGuide />} />
            <Route path="/completed" element={<Completion />} />
            <Route path="/history" element={<ErrorBoundary><ProtectedHistory /></ErrorBoundary>} />
            <Route path="/login" element={<AuthRedirect><Login /></AuthRedirect>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  )
}

function NearbyShopsRoute() {
  const { user } = useAuth()
  const session = getRepairSession()
  return isValidDiagnosisSession(session, user?.id)
    ? <NearbyShops />
    : <Navigate to="/dashboard" replace />
}

export default function App() {
  useEffect(() => {
    void testSupabaseConnection()
  }, [])

  return (
    <AuthProvider>
      <BrowserRouter>
        <LocaleSync />
        <AssistantProvider>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </AssistantProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}

function LocaleSync() {
  useSyncExternalStore(subscribeLocale, getLocale)
  return null
}
