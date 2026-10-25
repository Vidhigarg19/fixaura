import { Suspense, lazy, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Wrench } from 'lucide-react'
import { getLocale, subscribeLocale } from './i18n'
import { testSupabaseConnection } from './lib/test-supabase'
import { supabase } from './services/supabase'

const Landing = lazy(() => import('./Pages/Landing'))
const CameraCapture = lazy(() => import('./Pages/CameraCapture'))
const Auth = lazy(() => import('./Pages/Auth'))
const Diagnosis = lazy(() => import('./Pages/Diagnosis'))
const DiagnosisHistory = lazy(() => import('./Pages/DiagnosisHistory'))
const ToolChecklist = lazy(() => import('./Pages/ToolChecklist'))
const RepairGuide = lazy(() => import('./Pages/RepairGuide'))
const Completion = lazy(() => import('./Pages/Completion'))
const History = lazy(() => import('./Pages/History'))
const Login = lazy(() => import('./Pages/Login'))

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#041329] flex flex-col items-center justify-center gap-6">
      <div className="relative flex items-center justify-center">
        <div className="h-20 w-20 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        <div className="absolute h-14 w-14 rounded-full border border-primary/10 border-t-primary/40 animate-[spin_1.5s_linear_infinite_reverse]" />
        <div className="absolute h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shadow-[0_0_24px_rgba(0,245,212,0.3)]">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
      </div>
      <p className="text-[12px] uppercase tracking-[0.26em] text-primary/60 font-semibold animate-pulse">
        FixAura
      </p>
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()

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
            <Route path="/tools" element={<ToolChecklist />} />
            <Route path="/guide" element={<RepairGuide />} />
            <Route path="/completed" element={<Completion />} />
            <Route path="/history" element={<ProtectedHistory />} />
            <Route path="/login" element={<AuthRedirect><Login /></AuthRedirect>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  )
}

function ProtectedHistory() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(() =>
    supabase ? null : false
  )

  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session))
    })
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setAuthenticated(Boolean(data.session))
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  if (authenticated === null) return <PageLoader />
  if (!authenticated) return <Navigate to="/login" replace />
  return <History />
}

function AuthRedirect({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(() =>
    supabase ? null : false
  )

  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session))
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('Unable to check sign-in status:', error)
        if (active) setAuthenticated(false)
        return
      }
      if (active) setAuthenticated(Boolean(data.session))
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  if (authenticated === null) return <PageLoader />
  if (authenticated) return <Navigate to="/" replace />
  return children
}

export default function App() {
  useEffect(() => {
    testSupabaseConnection()
  }, [])

  return (
    <BrowserRouter>
      <LocaleSync />
      <AnimatedRoutes />
    </BrowserRouter>
  )
}

function LocaleSync() {
  // Forces a re-render when the selected locale changes.
  useSyncExternalStore(subscribeLocale, getLocale)
  return null
}
