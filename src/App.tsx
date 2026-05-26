import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'

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

function App() {
  return (
    <BrowserRouter>
      <AnimatePresence mode="wait">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/capture" element={<CameraCapture />} />
            <Route path="/diagnosis" element={<Diagnosis />} />
            <Route path="/tools" element={<ToolChecklist />} />
            <Route path="/guide" element={<RepairGuide />} />
            <Route path="/done" element={<Completion />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AnimatePresence>
    </BrowserRouter>
  )
}

export default App
