// S05 — Safety Policy & Guardrails (context-aware, refined)
//
// A single, framework-free moderation utility shared by the client and mirrored
// by the analyze-image edge function (supabase/functions/analyze-image/logic.ts,
// which cannot import from src/, so the rules are duplicated there on purpose;
// keep the two in sync and bump SAFETY_POLICY_VERSION in both).
//
// Design rules (consistent with src/utils/riskDecision.ts):
//   - This module only ever RAISES the risk level; it never downgrades.
//   - It emits a RiskDecision signal that is fed INTO decideRisk(); the risk
//     engine stays the single source of truth for the final decision.
//
// Calibration (why this file is deliberately NOT keyword-greedy):
//   - Only genuine, life-threatening hazards reach 'professional' / 'emergency'
//     (the levels that BLOCK the repair flow): live/exposed/sparking wiring, an
//     active gas leak, fire/smoke/burning, water meeting electricity, a burst
//     water main or structural failure, or an explicit report of injury.
//   - Routine repair vocabulary (refrigerant, a gas valve, "high voltage" on a
//     label, a capacitor) is only 'caution'. Caution shows a disclaimer and the
//     flow CONTINUES; it never blocks.
//   - A phrase counts only when it is ASSERTED. A precaution such as "if you see
//     sparks, stop", "do not touch exposed wires" or "no smoke" is not a hazard
//     report, so it is ignored. Callers should also avoid screening the model's
//     own boilerplate safety warning (see the call sites).

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
  /** true when any finding is professional/emergency (i.e. the flow must be blocked). */
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
  /** Lowercased phrases (English + Hindi). */
  phrases: string[]
}

const RULES: Rule[] = [
  // ---- emergency: immediate danger to life ----
  {
    category: 'gas',
    level: 'emergency',
    phrases: [
      'gas smell', 'smell of gas', 'smell gas', 'smelling gas', 'smells like gas', 'smells of gas',
      'gas leak', 'leaking gas', 'lpg leak', 'cylinder leak', 'gas cylinder leak',
      'गैस की गंध', 'गैस की बदबू', 'गैस लीक', 'सिलेंडर लीक',
    ],
  },
  {
    category: 'fire',
    level: 'emergency',
    phrases: [
      'burning smell', 'smells burnt', 'smells burning', 'smell burning', 'smell of burning',
      'burning plastic', 'burnt plastic', 'on fire', 'caught fire', 'catching fire', 'flames coming',
      'sparking', 'sparks flying', 'sparks coming', 'throwing sparks', 'shooting sparks', 'arcing',
      'smoke coming', 'smoke from', 'smoke is', 'smoke pouring', 'smoke out', 'see smoke',
      'saw smoke', 'seeing smoke', 'there is smoke', 'there was smoke', 'smoking from',
      'जलने की गंध', 'जलने की बदबू', 'आग लग', 'आग लगी', 'लपटें',
      'चिंगारी निकल', 'चिंगारियां निकल', 'धुआँ निकल', 'धुआं निकल', 'धुआँ आ', 'धुआं आ',
    ],
  },
  {
    category: 'water_electrical',
    level: 'emergency',
    phrases: [
      'water near electricity', 'water near electrical', 'flooding near electricity',
      'water on the outlet', 'water in the socket', 'water is in the socket', 'water inside the socket',
      'water in the outlet', 'water is in the outlet', 'water inside the outlet', 'wet outlet', 'wet socket',
      'बिजली के पास पानी', 'बिजली के पास बाढ़', 'पानी और बिजली', 'सॉकेट में पानी',
    ],
  },
  {
    category: 'medical',
    level: 'emergency',
    phrases: [
      'electric shock', 'got shocked', 'shocked me', 'someone collapsed', 'unconscious',
      "can't breathe", 'cannot breathe', 'chest pain', 'severe burn',
      'बेहोश', 'सांस नहीं', 'बिजली का करंट लगा',
    ],
  },

  // ---- professional: do not DIY (genuinely dangerous work or condition) ----
  {
    category: 'electrical',
    level: 'professional',
    phrases: [
      'exposed live', 'live wire', 'live wires', 'bare wire', 'bare wires', 'bare wiring',
      'exposed wire', 'exposed wires', 'exposed wiring',
      'scorch marks', 'scorched outlet', 'scorched socket', 'melted plug', 'melted socket',
      'melted outlet', 'main electrical panel', 'breaker panel wiring', 'service panel',
      'rewire the house', 'mains wiring',
      'खुली तार', 'नंगी तार', 'करंट आ रहा', 'बिजली का झटका',
    ],
  },
  {
    category: 'gas',
    level: 'professional',
    phrases: [
      'repair the gas', 'replace the gas line', 'replace the gas pipe', 'modify the gas',
      'gas line repair', 'gas pipe repair', 'install a gas', 'गैस पाइप बदल',
    ],
  },
  {
    category: 'structural',
    level: 'professional',
    phrases: [
      'load bearing wall', 'load-bearing wall', 'remove a wall', 'knock down the wall',
      'ceiling collapse', 'roof collapse', 'foundation crack', 'cracked beam',
      'water main burst', 'burst water main', 'water main break', 'main pipe burst',
      'दीवार गिरा', 'छत गिर', 'बीम में दरार',
    ],
  },
  {
    category: 'chemical',
    level: 'professional',
    phrases: [
      'mix bleach and ammonia', 'bleach and ammonia', 'asbestos', 'lead paint',
      'ब्लीच और अमोनिया', 'एस्बेस्टस',
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

  // ---- caution: routine repair vocabulary. Shows a disclaimer; NEVER blocks. ----
  {
    category: 'electrical',
    level: 'caution',
    phrases: ['240v', '240 volt', 'high voltage', 'capacitor', 'magnetron'],
  },
  {
    category: 'gas',
    level: 'caution',
    phrases: [
      'gas line', 'gas pipe', 'gas connection', 'gas regulator', 'gas valve',
      'गैस पाइप', 'गैस लाइन', 'गैस कनेक्शन',
    ],
  },
  {
    category: 'chemical',
    level: 'caution',
    phrases: ['refrigerant', 'freon'],
  },
]

const LEVEL_RANK: Record<SafetyLevel, number> = {
  caution: 1,
  professional: 2,
  emergency: 3,
}

function normalize(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase().replace(/[\u2018\u2019]/g, "'")
}

// Words that turn a mention into a precaution / negation rather than a report.
// Only the stretch immediately BEFORE the phrase (back to the last comma, colon or
// conjunction) is inspected, so "it is not working and sparks" still counts while
// "stop if you see sparks" and "no smoke" do not.
const PRECAUTION_RE =
  /\b(?:if|in case|should|whenever|unless|never|no|not|without|avoid|avoiding|prevent|preventing|protect|reduce|risk|danger of|check for|check that|checking for|watch for|watch out|look for|look out for|looking for|be alert|signs? of|free of|free from|ensure|make sure)\b|n't\b/
const HINDI_PRECAUTION = ['अगर', 'यदि', 'कभी न']

// A spark in the context of an igniter / lighter / spark plug is normal operation.
const IGNITER_RE = /\b(?:ignit\w*|lighter|spark plug|candle)\b/

const CLAUSE_DELIMITER = /[.!?\n;]/

function clauseBounds(text: string, index: number): { start: number; end: number } {
  let start = index
  while (start > 0 && !CLAUSE_DELIMITER.test(text[start - 1])) start -= 1
  let end = index
  while (end < text.length && !CLAUSE_DELIMITER.test(text[end])) end += 1
  return { start, end }
}

function isPrecautionary(prefix: string): boolean {
  const segment = prefix.split(/\b(?:and|but|however|then|because|so)\b|[,:()]/).pop() ?? ''
  const tail = segment.slice(-60)
  return PRECAUTION_RE.test(tail) || HINDI_PRECAUTION.some((marker) => tail.includes(marker))
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[a-z0-9]/.test(ch)
}

/**
 * True when `phrase` appears in `haystack` as an ASSERTION: on word boundaries
 * (for ASCII phrases) and not inside a precaution/negation clause.
 */
function phraseIsActive(haystack: string, phrase: string): boolean {
  const ascii = /^[\x20-\x7e]+$/.test(phrase)
  let from = 0
  for (;;) {
    const index = haystack.indexOf(phrase, from)
    if (index === -1) return false
    from = index + phrase.length

    if (ascii && (isWordChar(haystack[index - 1]) || isWordChar(haystack[index + phrase.length]))) {
      continue
    }
    const { start, end } = clauseBounds(haystack, index)
    if (isPrecautionary(haystack.slice(start, index))) continue
    if (phrase.includes('spark') && IGNITER_RE.test(haystack.slice(start, end))) continue
    return true
  }
}

function emptyVerdict(): SafetyVerdict {
  return { flagged: false, blocked: false, highestLevel: null, findings: [], categories: [] }
}

/**
 * Screens arbitrary text (a user description, a note, an answer, or the model's
 * OBSERVATION of the photo) and returns a structured verdict.
 */
export function screenText(input: unknown): SafetyVerdict {
  if (typeof input !== 'string' || input.trim() === '') return emptyVerdict()
  const haystack = normalize(input)

  const findings: SafetyFinding[] = []
  const seen = new Set<string>()
  for (const rule of RULES) {
    for (const phrase of rule.phrases) {
      if (!phraseIsActive(haystack, phrase)) continue
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
 * Combines several text fields into one verdict (each field is its own clause).
 *
 * Pass what the USER reported and what the model OBSERVED (issue name, summary,
 * recommended fix). Do NOT pass the model's generic safetyWarning or tool list:
 * those are precautionary boilerplate and are not evidence of a hazard.
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
export const SAFETY_POLICY_VERSION = 's05.2'
