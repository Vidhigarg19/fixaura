import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { t } from '../i18n'

type DemoMode = 'scan' | 'understand' | 'repair'

const demoModes: { id: DemoMode; label: string; number: string }[] = [
  { id: 'scan', label: 'landing.demo.scanTab', number: '01' },
  { id: 'understand', label: 'landing.demo.understandTab', number: '02' },
  { id: 'repair', label: 'landing.demo.repairTab', number: '03' },
]

export default function InteractiveRepairDemo() {
  const [mode, setMode] = useState<DemoMode>('scan')
  const [scanRun, setScanRun] = useState(0)
  const sceneRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const parallaxX = useMotionValue(0)
  const parallaxY = useMotionValue(0)
  const sceneX = useTransform(parallaxX, [-1, 1], [-6, 6])
  const sceneY = useTransform(parallaxY, [-1, 1], [-5, 5])

  const selectMode = (nextMode: DemoMode) => {
    setMode(nextMode)
    if (nextMode === 'scan') setScanRun((run) => run + 1)
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = demoModes.findIndex(({ id }) => `demo-tab-${id}` === event.currentTarget.id)
    let nextIndex: number
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % demoModes.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + demoModes.length) % demoModes.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = demoModes.length - 1
    else return
    event.preventDefault()
    selectMode(demoModes[nextIndex].id)
    document.getElementById(`demo-tab-${demoModes[nextIndex].id}`)?.focus()
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || !sceneRef.current) return
    const bounds = sceneRef.current.getBoundingClientRect()
    parallaxX.set(Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2)))
    parallaxY.set(Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2)))
  }

  return (
    <div
      id="interactive-demo"
      className="relative min-w-0 scroll-mt-24"
    >
      <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        {t('landing.demo.title')}
      </p>

      <motion.div
        ref={sceneRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          parallaxX.set(0)
          parallaxY.set(0)
        }}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.75, ease: 'easeOut', delay: 0.15 }}
        id="demo-panel"
        role="tabpanel"
        aria-labelledby={`demo-tab-${mode}`}
        tabIndex={0}
        className="relative isolate h-[320px] overflow-hidden sm:h-[360px] lg:h-[420px]"
        aria-label={t('landing.demo.sceneAria')}
      >
        <motion.div style={{ x: sceneX, y: sceneY }} className="absolute inset-0">
          <svg
            viewBox="0 0 620 400"
            role="img"
            aria-label={t('landing.demo.tapAria')}
            className="absolute inset-0 h-full w-full overflow-visible"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <linearGradient id="chrome-body" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#687781" />
                <stop offset="0.12" stopColor="#f4ffff" />
                <stop offset="0.24" stopColor="#83929a" />
                <stop offset="0.44" stopColor="#ffffff" />
                <stop offset="0.61" stopColor="#778991" />
                <stop offset="0.78" stopColor="#edf7f8" />
                <stop offset="1" stopColor="#64737b" />
              </linearGradient>
              <linearGradient id="chrome-top" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="0.38" stopColor="#cbd7db" />
                <stop offset="1" stopColor="#596b74" />
              </linearGradient>
              <linearGradient id="counter-top" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#263642" />
                <stop offset="0.17" stopColor="#111d29" />
                <stop offset="1" stopColor="#080f17" />
              </linearGradient>
              <filter id="tap-shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="10" />
              </filter>
            </defs>

            <ellipse cx="337" cy="319" rx="172" ry="18" fill="#000" opacity="0.56" filter="url(#tap-shadow)" />
            <path d="M142 323 H600 V400 H142 Z" fill="url(#counter-top)" stroke="#52636d" strokeOpacity="0.4" />
            <path d="M142 324 H600" stroke="#90a2a9" strokeOpacity="0.28" strokeWidth="2" />
            <path d="M173 350 H566" stroke="#667881" strokeOpacity="0.12" strokeWidth="1" />

            <path d="M295 311 C295 297 307 287 321 287 H440 C455 287 467 298 467 312 V325 H295 Z" fill="url(#chrome-top)" />
            <ellipse cx="381" cy="312" rx="88" ry="13" fill="url(#chrome-body)" />
            <ellipse cx="381" cy="311" rx="60" ry="7" fill="#25343e" opacity="0.75" />
            <path d="M419 300 V156 C419 102 385 72 331 72 H261 C225 72 205 94 205 128 V196" fill="none" stroke="#3e4d56" strokeWidth="53" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M419 294 V156 C419 105 385 76 331 76 H261 C229 76 210 96 210 128 V193" fill="none" stroke="url(#chrome-body)" strokeWidth="43" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M404 290 V157 C404 111 377 91 331 91 H261 C239 91 225 104 225 128 V189" fill="none" stroke="white" strokeOpacity="0.62" strokeWidth="4" strokeLinecap="round" />
            <path d="M184 195 H231 V208 H184 Z" fill="url(#chrome-top)" />
            <path d="M192 203 H225" stroke="#25333b" strokeWidth="3" opacity="0.7" />
            <ellipse cx="419" cy="177" rx="29" ry="10" fill="url(#chrome-top)" />
            <path d="M419 172 V128" stroke="url(#chrome-body)" strokeWidth="13" strokeLinecap="round" />
            <path d="M419 132 C419 119 437 116 456 116" stroke="#24333c" strokeWidth="19" strokeLinecap="round" />
            <path d="M419 129 C419 119 437 117 453 117" stroke="url(#chrome-top)" strokeWidth="14" strokeLinecap="round" />
            <path d="M402 182 C409 188 429 188 436 182" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="2" />

            {mode === 'scan' && (
              <>
                <rect x="155" y="51" width="365" height="248" rx="10" fill="none" stroke="#00f5d4" strokeOpacity="0.66" strokeWidth="1.2" />
                <path d="M155 79 V51 H184 M491 51 H520 V79 M155 271 V299 H184 M491 299 H520 V271" fill="none" stroke="#a0ffeb" strokeWidth="3" strokeLinecap="round" />
                {reduceMotion ? (
                  <line x1="155" y1="178" x2="520" y2="178" stroke="#00f5d4" strokeOpacity="0.7" />
                ) : (
                  <motion.line
                    key={scanRun}
                    x1="155"
                    x2="520"
                    initial={{ y1: 54, y2: 54, opacity: 0 }}
                    animate={{ y1: 296, y2: 296, opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.8, ease: 'easeInOut' }}
                    stroke="#00f5d4"
                    strokeWidth="1.5"
                    style={{ filter: 'drop-shadow(0 0 5px rgba(0,245,212,0.9))' }}
                  />
                )}
                {reduceMotion ? (
                  <ellipse cx="436" cy="123" rx="39" ry="25" fill="none" stroke="#00f5d4" strokeWidth="1.5" strokeDasharray="4 4" />
                ) : (
                  <motion.ellipse
                    key={`handle-${scanRun}`}
                    cx="436"
                    cy="123"
                    rx="39"
                    ry="25"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
                    fill="none"
                    stroke="#7bf5df"
                    strokeWidth="1.5"
                    strokeDasharray="1"
                  />
                )}
              </>
            )}
            {mode === 'understand' && (
              <>
                <circle cx="419" cy="177" r="14" fill="#00f5d4" fillOpacity="0.12" stroke="#00f5d4" strokeWidth="1.5" />
                <path d="M433 177 C462 161 476 145 504 145" fill="none" stroke="#7bf5df" strokeWidth="1.5" strokeDasharray="4 4" />
                <circle cx="433" cy="177" r="2.5" fill="#a0ffeb" />
              </>
            )}
            {mode === 'repair' && (
              <>
                <path d="M267 161 C299 132 343 131 371 150" fill="none" stroke="#00f5d4" strokeWidth="2" strokeDasharray="5 5" />
                <path d="M366 143 L377 154 L362 157" fill="none" stroke="#a0ffeb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="268" cy="162" r="5" fill="#00f5d4" />
              </>
            )}
          </svg>

          <motion.div
            animate={reduceMotion ? undefined : { y: [0, 7, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
            className="absolute left-[29%] top-[51%] h-3 w-2 rounded-[70%_30%_60%_40%] bg-primary shadow-[0_0_12px_rgba(0,245,212,0.6)] sm:left-[30%] sm:top-[50%]"
          />

          {mode === 'understand' && (
            <motion.div
              key="diagnosis"
              initial={reduceMotion ? false : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.18, duration: 0.3 }}
              className="absolute right-2 top-[1%] w-[min(14rem,45%)] rounded-xl border border-white/12 bg-[#0a1a27]/95 p-3.5 shadow-[0_14px_36px_rgba(0,0,0,0.35)] backdrop-blur-md sm:right-5 sm:top-[20%] sm:w-56 sm:p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary sm:text-[11px]">{t('landing.demo.causeLabel')}</p>
              <p className="mt-1 text-sm font-semibold leading-snug text-text-primary sm:text-base">{t('landing.demo.cause')}</p>
            </motion.div>
          )}
          {mode === 'repair' && (
            <motion.div
              key="step-card"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.3 }}
              className="absolute right-2 top-[1%] w-[min(14rem,45%)] rounded-xl border border-primary/25 bg-[#0a1a27]/95 p-3.5 shadow-[0_14px_36px_rgba(0,0,0,0.35)] backdrop-blur-md sm:right-5 sm:top-[19%] sm:w-56 sm:p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary sm:text-[11px]">{t('landing.demo.guidePreview')}</p>
              <p className="mt-1.5 text-sm font-semibold leading-snug text-text-primary sm:text-base">{t('landing.demo.step')}</p>
            </motion.div>
          )}

        </motion.div>
      </motion.div>

      <div role="tablist" aria-label={t('landing.demo.stepsAria')} className="mt-3 grid grid-cols-3 border-y border-white/10">
        {demoModes.map(({ id, label, number }) => (
          <button
            key={id}
            id={`demo-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={mode === id}
            aria-controls="demo-panel"
            tabIndex={mode === id ? 0 : -1}
            onClick={() => selectMode(id)}
            onKeyDown={handleTabKeyDown}
            className={`flex min-h-14 items-center justify-center gap-2 border-b-2 px-2 text-sm font-semibold transition-colors sm:gap-3 sm:text-base ${
              mode === id ? 'border-primary text-primary' : 'border-transparent text-text-subtle hover:text-text-primary'
            }`}
          >
            <span className="text-[10px] font-medium tracking-[0.12em] opacity-60 sm:text-xs">{number}</span>
            {t(label)}
          </button>
        ))}
      </div>
      {mode === 'understand' && (
        <p className="sr-only">{t('landing.demo.causeLabel')}: {t('landing.demo.cause')}</p>
      )}
      {mode === 'repair' && <p className="sr-only">{t('landing.demo.step')}</p>}
    </div>
  )
}
