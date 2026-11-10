// S07 — Approved guide payload & template versioning.
//
// Guided repair (the /tools checklist and the /guide steps) may only show
// reviewer-approved content. The decision comes from server data on the agreed
// diagnosis (`approvedTemplateId` + `policyVersion`), validated here against a
// registry of approved templates and the CURRENT approved policy version.
//
// This is the single choke point (V05, fail closed). In order:
//  0. A blocked risk decision, safetyStop or high severity -> NEVER a guide.
//  1. 'approved': a registered, current approved template id + matching policy version.
// Nothing else unlocks guided repair. AI-generated steps (diagnosis.guideSteps) and
// steps built from the diagnosis text are NOT reviewed approval, and a low or medium
// risk level alone does not unlock a guide. The approved registry below is empty for
// live content, so every live result is unavailable until reviewed templates exist.
import type { DiagnosisResult } from '../types/repair'
import type { AgreedDiagnosis } from './diagnosisView'
import { isBlocked, type RiskDecision } from './riskDecision'

/**
 * The policy version the approved templates are reviewed against. A payload
 * whose `policyVersion` does not match is treated as stale/unreviewed and the
 * guide stays closed. Bump this when the approved-content policy changes, and
 * only after templates are re-reviewed.
 */
export const GUIDE_TEMPLATE_POLICY_VERSION = 's07.1'

/**
 * Registry of template ids that have been reviewed and approved for the current
 * policy version. In production this will be seeded from server-reviewed
 * content; until then it is intentionally empty, so live results (which carry
 * no approvedTemplateId anyway) stay fail-closed. Dev fixtures use their own
 * ids (e.g. 'fixture-template-tap') and are only honoured in fixture mode via
 * `getGuideAvailability(extras, { allowFixtureTemplates: true })`.
 */
const APPROVED_TEMPLATE_IDS: ReadonlySet<string> = new Set<string>([
  // Intentionally empty for live content. Reviewed template ids go here.
])

/** Fixture template ids, honoured ONLY when fixture mode is explicitly allowed. */
const FIXTURE_TEMPLATE_IDS: ReadonlySet<string> = new Set<string>([
  'fixture-template-tap',
])

export type GuideUnavailableReason =
  | 'no_approved_content' // no agreed data at all
  | 'no_template' // agreed data present but approvedTemplateId is null
  | 'unknown_template' // template id is not in the approved registry
  | 'policy_version_mismatch' // template's policy version is stale/unreviewed
  | 'risk_blocked' // a genuine hazard blocks the guide
  | 'no_steps' // kept for compatibility; the gate no longer returns it

export type GuideAvailability =
  | { status: 'available'; source: 'approved'; templateId: string; policyVersion: string }
  | { status: 'unavailable'; reason: GuideUnavailableReason }

interface GuideAvailabilityOptions {
  /** Dev/fixture only: also accept fixture template ids. Never set in prod code paths. */
  allowFixtureTemplates?: boolean
  /** The current result. Used only to block (safetyStop / high severity); it never unlocks a guide. */
  diagnosis?: DiagnosisResult | null
  /** The combined risk decision for the result. A blocked decision never gets a guide. */
  decision?: RiskDecision
}

/**
 * Validates the agreed diagnosis's approved-template fields and returns whether
 * guided repair may be shown. Call with the server-supplied `extras`; calling
 * with null/undefined (no agreed data) is the fail-closed default.
 */
export function getGuideAvailability(
  extras?: AgreedDiagnosis | null,
  options: GuideAvailabilityOptions = {}
): GuideAvailability {
  // A genuine hazard always wins: a blocked result never gets any guide.
  if (options.decision && isBlocked(options.decision)) {
    return { status: 'unavailable', reason: 'risk_blocked' }
  }

  const diagnosis = options.diagnosis
  if (diagnosis && (diagnosis.safetyStop || diagnosis.severity === 'high')) {
    return { status: 'unavailable', reason: 'risk_blocked' }
  }

  // The only way in: a reviewed, current approved template.
  const approved = approvedTemplateAvailability(extras, options)
  if (approved) return approved

  return extras
    ? approvedTemplateReason(extras, options)
    : { status: 'unavailable', reason: 'no_approved_content' }
}

function isKnownTemplate(templateId: string, options: GuideAvailabilityOptions): boolean {
  return (
    APPROVED_TEMPLATE_IDS.has(templateId) ||
    (options.allowFixtureTemplates === true && FIXTURE_TEMPLATE_IDS.has(templateId))
  )
}

function approvedTemplateAvailability(
  extras: AgreedDiagnosis | null | undefined,
  options: GuideAvailabilityOptions
): GuideAvailability | null {
  if (!extras) return null
  const templateId = extras.approvedTemplateId
  if (!templateId || typeof templateId !== 'string' || !isKnownTemplate(templateId, options)) {
    return null
  }
  // A template is only valid against the policy version it was reviewed under.
  // Fixtures carry their own policy string; in fixture mode we accept it.
  const versionOk =
    extras.policyVersion === GUIDE_TEMPLATE_POLICY_VERSION ||
    (options.allowFixtureTemplates === true && FIXTURE_TEMPLATE_IDS.has(templateId))
  if (!versionOk) return null
  return {
    status: 'available',
    source: 'approved',
    templateId,
    policyVersion: extras.policyVersion,
  }
}

/** Why the approved-template tier did not apply. */
function approvedTemplateReason(
  extras: AgreedDiagnosis,
  options: GuideAvailabilityOptions
): GuideAvailability {
  const templateId = extras.approvedTemplateId
  if (!templateId || typeof templateId !== 'string') {
    return { status: 'unavailable', reason: 'no_template' }
  }
  if (!isKnownTemplate(templateId, options)) {
    return { status: 'unavailable', reason: 'unknown_template' }
  }
  return { status: 'unavailable', reason: 'policy_version_mismatch' }
}

/** Shorthand for callers that only need a yes/no answer from the same gate. */
export function isGuideAvailable(
  extras?: AgreedDiagnosis | null,
  options: GuideAvailabilityOptions = {}
): boolean {
  return getGuideAvailability(extras, options).status === 'available'
}

/** i18n key explaining why the guide is unavailable, for the unavailable panel. */
export function guideUnavailableReasonKey(reason: GuideUnavailableReason): string {
  switch (reason) {
    case 'no_template':
    case 'unknown_template':
      return 'guide.unavailableUnsupported'
    case 'policy_version_mismatch':
      return 'guide.unavailableStale'
    case 'no_steps':
      return 'guide.unavailableNoSteps'
    case 'risk_blocked':
      return 'guide.unavailableBody'
    case 'no_approved_content':
    default:
      return 'guide.unavailableBody'
  }
}
