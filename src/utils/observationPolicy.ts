// S08 — Observation policy.
//
// Pure, framework-free rules for the truthful before/after observation result.
// No Vite/Deno globals, so the same logic can be mirrored server-side later
// (like src/lib/safety.ts). The core invariant: an observation NEVER certifies
// safety. A visible improvement can always be overridden to professional_review
// when a hazard is present, but a hazard override can never be relaxed into a
// positive state.

import type { ObservationStatus } from '../types/repair'

/**
 * Version of the observation rules. Bump when the mapping or the safety
 * override logic changes; persisted results carry it so stale observations can
 * be detected and re-reviewed.
 */
export const OBSERVATION_POLICY_VERSION = 's08.1'

export const OBSERVATION_STATUSES: readonly ObservationStatus[] = [
  'visible_change',
  'no_clear_change',
  'incomparable',
  'insufficient_evidence',
  'professional_review',
]

export function isObservationStatus(value: unknown): value is ObservationStatus {
  return (
    typeof value === 'string' &&
    (OBSERVATION_STATUSES as readonly string[]).includes(value)
  )
}

/**
 * The only state that reads as "something visibly got better". This is the
 * state that must NEVER be allowed to stand when a hazard is present, because
 * a superficial visible improvement must not imply a hidden electrical /
 * structural / gas fault is safe.
 */
export function isPositiveObservation(status: ObservationStatus): boolean {
  return status === 'visible_change'
}

/** professional_review is the only state that demands a human expert. */
export function requiresProfessional(status: ObservationStatus): boolean {
  return status === 'professional_review'
}
