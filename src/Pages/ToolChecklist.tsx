import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check, AlertCircle, Wrench, Hammer, Scissors,
  Zap, Droplets, Wind, ShieldCheck, Paintbrush, Ruler, Flashlight
} from 'lucide-react'
import PageShell from '../components/PageShell'
import SafetyBubble from '../components/SafetyBubble'
import { getSession, saveSession } from '../services/repairSession'
import { getPrepTimeMinutes, isEssentialTool } from '../services/repairPlanner'
import { t } from '../i18n'

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
export default function ToolChecklist() {
  const navigate = useNavigate()
  const session = getSession()
  const tools = session?.diagnosis?.recommendedTools ?? []
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
    saveSession({ toolsAcknowledged: Object.keys(checked).filter((k) => checked[k]) })
    navigate('/guide')
  }

  if (!session?.diagnosis) {
    navigate('/capture')
    return null
  }

  const checkedCount = Object.values(checked).filter(Boolean).length
  const progress = tools.length ? (checkedCount / tools.length) * 100 : 0

  return (
    <PageShell className="pb-24">
      <div className="mx-auto max-w-lg px-4 pt-8">
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