import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

const Landing = lazy(() => import('./Pages/Landing'))
const CameraCapture = lazy(() => import('./Pages/CameraCapture'))
const Diagnosis = lazy(() => import('./Pages/Diagnosis'))
const ToolChecklist = lazy(() => import('./Pages/ToolChecklist'))
const RepairGuide = lazy(() => import('./Pages/RepairGuide'))
const Completion = lazy(() => import('./Pages/Completion'))

function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
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
            <Route path="/done" element={<Completion />} />
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
      <AnimatedRoutes />
    </BrowserRouter>
  );
}