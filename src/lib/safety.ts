// S05 — Safety Policy & Guardrails
//
// A single, framework-free moderation utility shared by the client and the
// analyze-image edge function. It has NO Vite (`import.meta.env`) or Deno
// globals so the exact same policy can run in the browser and in Deno (the
// edge function re-exports these helpers from its own pure `logic.ts`).
//
// Design rules (consistent with src/utils/riskDecision.ts):
//   - This module only ever RAISES the risk level; it never downgrades.
//   - It emits a RiskDecision signal that is fed INTO decideRisk(); the risk
//     engine stays the single source of truth for the final decision.
//   - Unknown / ambiguous input is treated as the safer side.
//   - It never fabricates a diagnosis and never bypasses a block.

export type SafetyCategory =
  | 'gas'
  | 'electrical'
  | 'fire'
  | 'structural'
  | 'water_electrical'
  | 'chemical'
  | 'medical'
  | 'policy'

/** How severe a matched category is. Maps onto the RiskDecision ranking. */
export type SafetyLevel = 'caution' | 'professional' | 'emergency'

export interface SafetyFinding {
  category: SafetyCategory
  level: SafetyLevel
  /** The phrase (normalized) that triggered the finding. For logging/tests only. */
  matched: string
}

export interface SafetyVerdict {
  /** true when at least one finding was produced. */
  flagged: boolean
  /** true when any finding is professional/emergency (i.e. content must be blocked). */
  blocked: boolean
  /** Highest level seen across all findings, or null when nothing flagged. */
  highestLevel: SafetyLevel | null
  findings: SafetyFinding[]
  /** Distinct categories, most-severe first — handy for picking a disclaimer. */
  categories: SafetyCategory[]
}

interface Rule {
  category: SafetyCategory
  level: SafetyLevel
  /** Lowercased phrases (English + Hindi). Matched as word-ish substrings. */
  phrases: string[]
}

// Ordered roughly by severity. Phrases cover English and Hindi, mirroring the
// bilingual hazard list that previously lived in assistantService.ts.
const RULES: Rule[] = [
  {
    category: 'gas',
    level: 'emergency',
    phrases: [
      'gas smell', 'smell of gas', 'smell gas', 'smelling gas', 'gas leak',
      'lpg leak', 'cylinder leak', 'gas cylinder leak',
      'गैस की गंध', 'गैस की बदबू', 'गैस लीक', 'सिलेंडर लीक',
    ],
  },
  {
    category: 'fire',
    level: 'emergency',
    phrases: [
      'burning smell', 'smells burnt', 'smell burning', 'on fire', 'caught fire',
      'flames', 'sparks', 'spark', 'smoke', 'smoking',
      'जलने की गंध', 'जलने की बदबू', 'आग लग', 'आग लगी', 'लपटें',
      'चिंगारी', 'चिंगारियां', 'धुआँ', 'धुआं',
    ],
  },
  {
    category: 'water_electrical',
    level: 'emergency',
    phrases: [
      'water near electricity', 'water near electrical', 'flooding near electricity',
      'water on the outlet', 'water in the socket', 'wet outlet', 'wet socket',
      'बिजली के पास पानी', 'बिजली के पास बाढ़', 'पानी और बिजली', 'सॉकेट में पानी',
    ],
  },
  {
    category: 'electrical',
    level: 'professional',
    phrases: [
      'exposed wiring', 'exposed wire', 'live wire', 'bare wire', 'bare wiring',
      'main electrical panel', 'breaker panel wiring', 'rewire the house',
      'mains wiring', '240v', '240 volt', 'high voltage',
      'खुली तार', 'नंगी तार', 'करंट आ रहा', 'बिजली का झटका',
    ],
  },
  {
    category: 'gas',
    level: 'professional',
    phrases: [
      'gas line', 'gas pipe', 'gas connection', 'gas regulator', 'gas valve',
      'गैस पाइप', 'गैस लाइन', 'गैस कनेक्शन',
    ],
  },
  {
    category: 'structural',
    level: 'professional',
    phrases: [
      'load bearing wall', 'load-bearing wall', 'remove a wall', 'knock down the wall',
      'ceiling collapse', 'roof collapse', 'foundation crack', 'cracked beam',
      'दीवार गिरा', 'छत गिर', 'बीम में दरार',
    ],
  },
  {
    category: 'chemical',
    level: 'professional',
    phrases: [
      'mix bleach and ammonia', 'bleach and ammonia', 'refrigerant', 'freon',
      'asbestos', 'lead paint', 'ब्लीच और अमोनिया', 'एस्बेस्टस',
    ],
  },
  {
    category: 'medical',
    level: 'emergency',
    phrases: [
      'electric shock', 'got shocked', 'someone collapsed', 'unconscious',
      "can't breathe", 'cannot breathe', 'chest pain', 'severe burn',
      'बेहोश', 'सांस नहीं', 'बिजली का करंट लगा',
    ],
  },
  {
    // Requests that fall outside what HomeGenie should advise on at all.
    category: 'policy',
    level: 'professional',
    phrases: [
      'bypass the safety', 'bypass safety', 'disable the breaker', 'defeat the interlock',
      'remove the ground', 'remove earthing', 'ungrounded on purpose',
      'सुरक्षा हटा', 'अर्थिंग हटा',
    ],
  },
]

const LEVEL_RANK: Record<SafetyLevel, number> = {
  caution: 1,
  professional: 2,
  emergency: 3,
}

function normalize(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase()
}

function matchesPhrase(haystack: string, phrase: string): boolean {
  const idx = haystack.indexOf(phrase)
  if (idx === -1) return false
  // For ASCII phrases, require a non-word boundary on each side so that, e.g.,
  // "spark" does not match inside "sparkling". Non-ASCII (Hindi) skips this
  // check because \w boundaries do not apply to Devanagari.
  if (!/^[\x20-\x7e]+$/.test(phrase)) return true
  const before = haystack[idx - 1]
  const after = haystack[idx + phrase.length]
  const isWord = (ch: string | undefined) => ch !== undefined && /[a-z0-9]/.test(ch)
  return !isWord(before) && !isWord(after)
}

function emptyVerdict(): SafetyVerdict {
  return { flagged: false, blocked: false, highestLevel: null, findings: [], categories: [] }
}

/**
 * Screens arbitrary text (a user description, a prompt, or AI output) against
 * the policy rules and returns a structured verdict.
 */
export function screenText(input: unknown): SafetyVerdict {
  if (typeof input !== 'string' || input.trim() === '') return emptyVerdict()
  const haystack = normalize(input)

  const findings: SafetyFinding[] = []
  const seen = new Set<string>()
  for (const rule of RULES) {
    for (const phrase of rule.phrases) {
      if (!matchesPhrase(haystack, phrase)) continue
      const key = `${rule.category}:${phrase}`
      if (seen.has(key)) continue
      seen.add(key)
      findings.push({ category: rule.category, level: rule.level, matched: phrase })
    }
  }

  if (findings.length === 0) return emptyVerdict()

  let highestLevel: SafetyLevel = 'caution'
  for (const f of findings) {
    if (LEVEL_RANK[f.level] > LEVEL_RANK[highestLevel]) highestLevel = f.level
  }

  // Distinct categories, ordered most-severe first.
  const byCategory = new Map<SafetyCategory, SafetyLevel>()
  for (const f of findings) {
    const current = byCategory.get(f.category)
    if (current === undefined || LEVEL_RANK[f.level] > LEVEL_RANK[current]) {
      byCategory.set(f.category, f.level)
    }
  }
  const categories = [...byCategory.entries()]
    .sort((a, b) => LEVEL_RANK[b[1]] - LEVEL_RANK[a[1]])
    .map(([category]) => category)

  return {
    flagged: true,
    blocked: LEVEL_RANK[highestLevel] >= LEVEL_RANK.professional,
    highestLevel,
    findings,
    categories,
  }
}

/**
 * Combines several text fields (description, summary, safetyWarning, fix, …)
 * into one verdict. Any field hitting the policy raises the overall level.
 */
export function screenFields(fields: ReadonlyArray<string | null | undefined>): SafetyVerdict {
  const combined = fields.filter((f): f is string => typeof f === 'string' && f.trim() !== '')
  if (combined.length === 0) return emptyVerdict()
  return screenText(combined.join('\n'))
}

/**
 * The RiskDecision signal implied by a verdict, for feeding into decideRisk().
 * 'safe' when nothing flagged — this NEVER downgrades because the risk engine
 * only keeps the most severe signal across all inputs.
 */
export function safetyRiskSignal(verdict: SafetyVerdict): 'safe' | SafetyLevel {
  return verdict.highestLevel ?? 'safe'
}

/** Convenience: screen a single string and get its risk signal directly. */
export function riskSignalForText(input: unknown): 'safe' | SafetyLevel {
  return safetyRiskSignal(screenText(input))
}

/**
 * Picks an i18n key for a short, human-readable disclaimer based on the most
 * severe category found. Falls back to a generic disclaimer. The caller
 * resolves the key with t(); this module stays string-free for localization.
 */
export function disclaimerKeyForVerdict(verdict: SafetyVerdict): string | null {
  if (!verdict.flagged) return null
  const top = verdict.categories[0]
  switch (top) {
    case 'gas':
      return 'safetyPolicy.disclaimer.gas'
    case 'electrical':
    case 'water_electrical':
      return 'safetyPolicy.disclaimer.electrical'
    case 'fire':
      return 'safetyPolicy.disclaimer.fire'
    case 'structural':
      return 'safetyPolicy.disclaimer.structural'
    case 'chemical':
      return 'safetyPolicy.disclaimer.chemical'
    case 'medical':
      return 'safetyPolicy.disclaimer.medical'
    case 'policy':
      return 'safetyPolicy.disclaimer.policy'
    default:
      return 'safetyPolicy.disclaimer.generic'
  }
}

/** Policy version string, surfaced in logs and the agreed contract. Bump on rule changes. */
export const SAFETY_POLICY_VERSION = 's05.1'
