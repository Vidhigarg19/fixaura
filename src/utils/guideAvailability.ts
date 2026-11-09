// S07 — Approved guide payload & template versioning.
//
// Guided repair (the /tools checklist and the /guide steps) may only show
// reviewer-approved content. The decision comes from server data on the agreed
// diagnosis (`approvedTemplateId` + `policyVersion`), validated here against a
// registry of approved templates and the CURRENT approved policy version.
//
// This is the single choke point. The rules are deliberately fail-closed:
//  - No agreed data (extras === null, i.e. today's live backend) -> unavailable.
//  - No approvedTemplateId (unsupported object / no reviewed template) -> unavailable.
//  - A templateId the frontend does not recognise as approved -> unavailable.
//  - A policyVersion that does not match the current approved version
//    (stale / unreviewed-against-current-policy) -> unavailable.
//
// Nothing the model writes (buildRepairPlan steps, recommendedTools free text,
// keyword guesses) can ever unlock the guide: only a registered, current
// approved template id does. This is what stops a fabricated universal 5-step
// guide from rendering for an unsupported object.

import type { AgreedDiagnosis } from './diagnosisView'

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

export type GuideAvailability =
  | { status: 'available'; templateId: string; policyVersion: string }
  | { status: 'unavailable'; reason: GuideUnavailableReason }

interface GuideAvailabilityOptions {
  /** Dev/fixture only: also accept fixture template ids. Never set in prod code paths. */
  allowFixtureTemplates?: boolean
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
  if (!extras) return { status: 'unavailable', reason: 'no_approved_content' }

  const templateId = extras.approvedTemplateId
  if (!templateId || typeof templateId !== 'string') {
    return { status: 'unavailable', reason: 'no_template' }
  }

  const known =
    APPROVED_TEMPLATE_IDS.has(templateId) ||
    (options.allowFixtureTemplates && FIXTURE_TEMPLATE_IDS.has(templateId))
  if (!known) {
    return { status: 'unavailable', reason: 'unknown_template' }
  }

  // A template is only valid against the policy version it was reviewed under.
  // Fixtures carry their own policy string; in fixture mode we accept it.
  const versionOk =
    extras.policyVersion === GUIDE_TEMPLATE_POLICY_VERSION ||
    (options.allowFixtureTemplates && FIXTURE_TEMPLATE_IDS.has(templateId))
  if (!versionOk) {
    return { status: 'unavailable', reason: 'policy_version_mismatch' }
  }

  return { status: 'available', templateId, policyVersion: extras.policyVersion }
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
    case 'no_approved_content':
    default:
      return 'guide.unavailableBody'
  }
}
