import { Suspense, lazy, useSyncExternalStore } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Wrench } from 'lucide-react'
import { getLocale, subscribeLocale } from './i18n'

const Landing = lazy(() => import('./Pages/Landing'))
const CameraCapture = lazy(() => import('./Pages/CameraCapture'))
const Diagnosis = lazy(() => import('./Pages/Diagnosis'))
const ToolChecklist = lazy(() => import('./Pages/ToolChecklist'))
const RepairGuide = lazy(() => import('./Pages/RepairGuide'))
// const Completion = lazy(() => import('./Pages/Completion'))

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#041329] flex flex-col items-center justify-center gap-6">
      <div className="relative flex items-center justify-center">
        {/* Outer rotating ring */}
        <div className="h-20 w-20 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        {/* Inner glow ring */}
        <div className="absolute h-14 w-14 rounded-full border border-primary/10 border-t-primary/40 animate-[spin_1.5s_linear_infinite_reverse]" />
        {/* Wrench icon center */}
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
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        <Suspense fallback={<PageLoader />}>
          <Routes location={location}>
            <Route path="/" element={<Landing />} />
            <Route path="/capture" element={<CameraCapture />} />
            <Route path="/diagnosis" element={<Diagnosis />} />
            <Route path="/tools" element={<ToolChecklist />} />
            <Route path="/guide" element={<RepairGuide />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <LocaleSync />
      <AnimatedRoutes />
    </BrowserRouter>
  );
}

function LocaleSync() {
  // Forces a re-render when the selected locale changes.
  useSyncExternalStore(subscribeLocale, getLocale)
  return null
}