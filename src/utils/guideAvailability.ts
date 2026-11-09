// Guided repair (the /tools checklist and the /guide steps) may only show
// reviewer-approved content delivered by the backend.
//
// No such contract exists yet: the analysis response has no eligibility field,
// no approved template, no approved step list, no tools/parts with critical
// flags and no approved alternatives. Until it does, guided repair is
// UNAVAILABLE for every result.
//
// Deliberately NOT used as an unlock:
//  - buildRepairPlan() steps (written in the frontend),
//  - recommendedTools (AI free text), isEssentialTool() keyword guesses and
//    getPrepTimeMinutes() estimates,
//  - the frontend-only `approvedTemplateId` field of the agreed diagnosis type
//    and the dev fixtures that fill it.
//
// When the backend contract lands, this is the single place to change, and the
// decision must come from server data, never from the client.

export type GuideAvailability = {
  status: 'unavailable'
  reason: 'no_approved_content'
}

export function getGuideAvailability(): GuideAvailability {
  return { status: 'unavailable', reason: 'no_approved_content' }
}

/** Shorthand for callers that only need a yes/no answer from the same gate. */
export function isGuideAvailable(): boolean {
  return getGuideAvailability().status !== 'unavailable'
}
