import { motion } from 'framer-motion'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check, AlertCircle, Wrench, Hammer, Scissors,
  Zap, Droplets, Wind, ShieldCheck, Paintbrush, Ruler, Flashlight
} from 'lucide-react'
import PageShell from '../components/PageShell'
import SafetyBubble from '../components/SafetyBubble'
import SafetyBlockedPanel from '../components/SafetyBlockedPanel'
import GuideUnavailablePanel from '../components/GuideUnavailablePanel'
import { saveSession } from '../services/repairSession'
import { getPrepTimeMinutes, isEssentialTool } from '../services/repairPlanner'
import { getLocale, subscribeLocale, t } from '../i18n'
import { buildDiagnosisView } from '../utils/diagnosisView'
import { withFixtureQuery } from '../utils/fixtureGate'
import { isBlocked } from '../utils/riskDecision'
import { withTextScreen } from '../utils/combinedRisk'
import { getGuideAvailability, guideUnavailableReasonKey } from '../utils/guideAvailability'
import { useDiagnosisSource } from '../utils/useDiagnosisSource'
import { useRepairPhoto } from '../utils/useRepairPhoto'
import RepairPhoto from '../components/RepairPhoto'
import { SessionRepairGate } from '../components/SessionPanels'
import { useSessionMode } from '../utils/useSessionLoader'
import FixtureBannerSlot from '../components/FixtureBannerSlot'

// DEV-ONLY banner. In a production build this is `null` and the import is removed.

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
}

const itemVariant = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0 },
}

const TOOL_ICONS: Record<string, { icon: React.ElementType }> = {
  // Adjustable wrench
  wrench:      { icon: Wrench },
  adjustable:  { icon: Wrench },
  spanner:     { icon: Wrench },

  // Pliers
  plier:       { icon: Wrench },

  // Thread-locker / glue / adhesive
  thread:      { icon: Paintbrush },
  locker:      { icon: Paintbrush },
  adhesive:    { icon: Paintbrush },
  glue:        { icon: Paintbrush },

  // Work gloves
  glove:       { icon: ShieldCheck },
  safety:      { icon: ShieldCheck },

  // Bucket
  bucket:      { icon: Droplets },
  container:   { icon: Droplets },
  bowl:        { icon: Droplets },

  // Cloth / rag
  cloth:       { icon: Wind },
  rag:         { icon: Wind },
  towel:       { icon: Wind },
  wipe:        { icon: Wind },

  // Screwdriver
  screw:       { icon: Wrench },
  driver:      { icon: Wrench },
  phillips:    { icon: Wrench },

  // Hammer
  hammer:      { icon: Hammer },

  // Electrical
  multimeter:  { icon: Zap },
  tester:      { icon: Zap },
  wire:        { icon: Zap },
  electric:    { icon: Zap },

  // Torch / flashlight
  torch:       { icon: Flashlight },
  flashlight:  { icon: Flashlight },
  light:       { icon: Flashlight },

  // Tape / measuring
  tape:        { icon: Ruler },
  measur:      { icon: Ruler },

  // Scissors / cutter
  scissor:     { icon: Scissors },
  cutter:      { icon: Scissors },
  knife:       { icon: Scissors },

  // Brush / paint
  brush:       { icon: Paintbrush },
  paint:       { icon: Paintbrush },
}
function matchTool(tool: string): { icon: React.ElementType } {
  const name = tool.toLowerCase()
  for (const [key, val] of Object.entries(TOOL_ICONS)) {
    if (name.includes(key)) return val
  }
  return { icon: Wrench }
}
function FreshToolChecklist() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale)
  const navigate = useNavigate()
  const source = useDiagnosisSource()
  const session = source.session
  // The user's main repair photo, found through every source (this tab, this device,
  // stored copy), so the checklist shows what is being repaired.
  const sessionMedia = useRepairPhoto(session)
  // The same hazard verdict every page uses. Low and medium results are never blocked
  // here; only a genuine hazard is, and it gets the safety panel below.
  const gate = session?.diagnosis
    ? withTextScreen(buildDiagnosisView(session.diagnosis, source.extras), session.diagnosis, session.description)
    : null
  const guideAvail = getGuideAvailability(source.extras, {
    allowFixtureTemplates: source.isFixture,
    diagnosis: session?.diagnosis ?? null,
    decision: gate?.decision,
  })
  const guideAvailable = guideAvail.status === 'available'
  const recommended = guideAvailable ? session?.diagnosis?.recommendedTools : undefined
  // Non-approved guides always list basic protection, so "wear protection" is a real
  // item the user ticks off. It is only added when the model's own list lacks it.
  const addProtectiveGear = guideAvail.status === 'available' && guideAvail.source !== 'approved'
  const tools = useMemo(() => {
    const list = [...(recommended ?? [])]
    if (!addProtectiveGear) return list
    const has = (pattern: RegExp) => list.some((tool) => pattern.test(tool))
    if (!has(/glove/i)) list.push(t('tools.protectiveGloves', locale))
    if (!has(/glasses|goggles|eye/i)) list.push(t('tools.safetyGlasses', locale))
    return list
  }, [recommended, addProtectiveGear, locale])
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [safetyOpen, setSafetyOpen] = useState(false)
  const [pendingTool, setPendingTool] = useState<string | null>(null)

  const prepMinutes = useMemo(() => getPrepTimeMinutes(tools), [tools])

  const essentialTools = tools.filter(isEssentialTool)
  const allEssentialChecked = essentialTools.every((tool) => checked[tool])

  const toggle = (tool: string) => {
    const isEssential = isEssentialTool(tool)
    if (!checked[tool] && isEssential) {
      setPendingTool(tool)
      setSafetyOpen(true)
      return
    }
    setChecked((c) => ({ ...c, [tool]: !c[tool] }))
  }

  const confirmSafety = () => {
    if (pendingTool) {
      setChecked((c) => ({ ...c, [pendingTool]: true }))
    }
    setSafetyOpen(false)
    setPendingTool(null)
  }

  const safetyMessage = () => {
    const tool = pendingTool?.toLowerCase() ?? ''
    if (tool.includes('glove')) return t('safety.gloves')
    if (tool.includes('water') || tool.includes('shutoff')) return t('safety.waterShutoff')
    return t('safety.powerOff')
  }

  const continueGuide = () => {
    if (!guideAvailable) return
    if (gate && isBlocked(gate.decision)) return
    // Fixture mode never writes to the stored session.
    if (!source.isFixture) {
      saveSession({ toolsAcknowledged: Object.keys(checked).filter((k) => checked[k]) })
    }
    navigate(withFixtureQuery('/guide'))
  }

  // Safety check on mount, before any tool is rendered. No redirect and no flash of tools.
  if (source.status === 'loading') {
    return (
      <PageShell className="flex items-center justify-center p-6">
        <div role="status" aria-live="polite" className="glass-panel w-full max-w-sm animate-pulse rounded-2xl p-6">
          <div className="mb-3 h-5 w-2/3 rounded bg-surface-high" />
          <div className="h-3 w-3/4 rounded bg-surface-high" />
          <span className="sr-only">{t('blocked.gateChecking')}</span>
        </div>
      </PageShell>
    )
  }
  if (session?.diagnosis && gate) {
    if (isBlocked(gate.decision) && (gate.decision === 'professional' || gate.decision === 'emergency')) {
      return (
        <PageShell className="pb-24">
          <div className="mx-auto max-w-lg px-4 pt-8">
            <SafetyBlockedPanel
              decision={gate.decision}
              issueName={session.diagnosis.issueName}
              analysisDetails={gate.analysisDetails}
              showToolsLocked
            />
          </div>
        </PageShell>
      )
    }
  }

  if (!session?.diagnosis) {
    navigate('/capture')
    return null
  }

  // Fail closed: no approved checklist exists, so no tools, essential-tool flags,
  // preparation time or "continue to guide" action are shown.
  if (!guideAvailable) {
    return (
      <PageShell className="pb-24">
        <div className="mx-auto max-w-lg px-4 pt-8">
          {source.isFixture && (
            <FixtureBannerSlot name={new URLSearchParams(window.location.search).get('fixture') ?? ''} />
          )}
          <GuideUnavailablePanel
            issueName={session.diagnosis.issueName}
            reasonKey={
              guideAvail.status === 'unavailable'
                ? guideUnavailableReasonKey(guideAvail.reason)
                : undefined
            }
          />
        </div>
      </PageShell>
    )
  }

  const checkedCount = Object.values(checked).filter(Boolean).length
  const progress = tools.length ? (checkedCount / tools.length) * 100 : 0

  return (
    <PageShell className="pb-24">
      <div className="mx-auto max-w-lg px-4 pt-8">
        {source.isFixture && (
          <FixtureBannerSlot name={new URLSearchParams(window.location.search).get('fixture') ?? ''} />
        )}
        <RepairPhoto sessionMedia={sessionMedia} aspectClass="aspect-[16/7]" className="mb-6" />
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-heading-lg mb-2"
        >
          {t('tools.title')}
        </motion.h1>
        <p className="text-text-secondary mb-2">{t('tools.subtitle')}</p>
        <p className="text-label-bold text-primary mb-6">
          {t('tools.prepTime')}: {prepMinutes} {t('tools.minutes')}
        </p>

        <div className="h-1 rounded-full bg-surface-high mb-8 overflow-hidden">
          <motion.div
            className="h-full bg-success"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        <motion.ul
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="space-y-3 mb-8"
        >
          {tools.map((tool) => {
            const done = !!checked[tool]
            const essential = isEssentialTool(tool)
            const { icon: Icon } = matchTool(tool)
            return (
              <motion.li key={tool} variants={itemVariant}>
                <button
                  type="button"
                  onClick={() => toggle(tool)}
                  className={`w-full flex items-center gap-4 glass-panel rounded-xl p-4 text-left transition-colors ${
                    done ? 'border-success/40' : essential ? 'border-warning/30' : ''
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                      done
                        ? 'bg-success/20 border-success text-success'
                        : 'border-border text-text-subtle'
                    }`}
                  >
                    {done ? (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                        <Check className="h-5 w-5" />
                      </motion.div>
                    ) : essential ? (
                      <AlertCircle className="h-4 w-4 text-warning" />
                    ) : null}
                  </span>

                  <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>

                  <div className="flex-1">
                    <span className={done ? 'line-through text-text-subtle' : ''}>{tool}</span>
                    {essential && (
                      <span className="ml-2 text-xs text-warning font-semibold uppercase">
                        {t('tools.essential')}
                      </span>
                    )}
                  </div>
                </button>
              </motion.li>
            )
          })}
        </motion.ul>

        {!allEssentialChecked && (
          <p className="text-sm text-warning mb-4">{t('tools.acknowledgeEssential')}</p>
        )}

        <div className="flex flex-col gap-3">
          <motion.button
            type="button"
            disabled={!allEssentialChecked}
            whileHover={allEssentialChecked ? { scale: 1.03 } : {}}
            whileTap={allEssentialChecked ? { scale: 0.97 } : {}}
            onClick={continueGuide}
            className="rounded-xl bg-primary py-3 font-semibold text-background disabled:opacity-40"
          >
            {t('tools.haveAll')}
          </motion.button>
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/capture')}
            className="rounded-xl border border-border py-3 text-text-secondary"
          >
            {t('tools.missing')}
          </motion.button>
        </div>
      </div>

      <SafetyBubble
        open={safetyOpen}
        message={safetyMessage()}
        onConfirm={confirmSafety}
        onCancel={() => {
          setSafetyOpen(false)
          setPendingTool(null)
        }}
      />
    </PageShell>
  )
}

/** /tools?session=<id> loads the saved session first and never renders tools from the cache. */
export default function ToolChecklist() {
  return useSessionMode() ? <SessionRepairGate /> : <FreshToolChecklist />
}
