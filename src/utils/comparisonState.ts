// V07: state for the before/after photo comparison screen. Pure: no React, no I/O.
//
// RULES
// - A comparison can only start when BOTH photos exist.
// - Server statuses map to NEUTRAL observation labels that describe what is visible.
//   Nothing maps to resolved, fixed, successful, safe or certified: a photo
//   comparison cannot confirm that a repair worked.
// - `needs_professional` is the most severe observation.
// - `error` (the comparison did not run or failed) is kept separate from
//   `inconclusive` (it ran but the photos did not allow a clear observation).
//
// The real comparison endpoint does not exist right now (the verify mode was
// removed from analyze-image in S02), so the UI does not send a request. These
// states are ready for when a backend contract exists; nothing here defines one.

export type ComparisonStage = 'preparing' | 'sending' | 'waiting'

export const COMPARISON_STAGES: readonly ComparisonStage[] = ['preparing', 'sending', 'waiting']

/** Neutral labels: they describe the photos, never the repair outcome. */
export type ObservationLabel =
  | 'issue_not_visible'
  | 'keep_watching'
  | 'issue_still_visible'
  | 'needs_professional'

export type ComparisonErrorKind = 'offline' | 'unavailable' | 'invalid_response' | 'failed'

export type ComparisonState =
  | { kind: 'needs_before' }
  | { kind: 'needs_after' }
  | { kind: 'ready' }
  | { kind: 'comparing'; stage: ComparisonStage }
  | { kind: 'observed'; observation: ObservationLabel }
  | { kind: 'inconclusive' }
  | { kind: 'error'; error: ComparisonErrorKind }

export type ComparisonEvent =
  /** The photos changed (taken, retaken or removed). */
  | { type: 'inputs'; hasBefore: boolean; hasAfter: boolean }
  | { type: 'start' }
  | { type: 'stage'; stage: ComparisonStage }
  /** A response arrived with this server status. */
  | { type: 'observed'; status: unknown }
  | { type: 'inconclusive' }
  | { type: 'error'; error: ComparisonErrorKind }

/** The before photo is checked first: without it there is nothing to compare against. */
export function inputState(hasBefore: boolean, hasAfter: boolean): ComparisonState {
  if (!hasBefore) return { kind: 'needs_before' }
  if (!hasAfter) return { kind: 'needs_after' }
  return { kind: 'ready' }
}

export function canStartComparison(state: ComparisonState): boolean {
  return state.kind === 'ready'
}

const SERVER_STATUS_TO_OBSERVATION: Readonly<Record<string, ObservationLabel>> = {
  resolved: 'issue_not_visible',
  monitor: 'keep_watching',
  unresolved: 'issue_still_visible',
  professional: 'needs_professional',
}

/** Neutral label for a server status, or null when the status is not recognised. */
export function observationForStatus(status: unknown): ObservationLabel | null {
  return typeof status === 'string' && Object.prototype.hasOwnProperty.call(SERVER_STATUS_TO_OBSERVATION, status)
    ? SERVER_STATUS_TO_OBSERVATION[status]
    : null
}

const OBSERVATION_RANK: Readonly<Record<ObservationLabel, number>> = {
  issue_not_visible: 0,
  keep_watching: 1,
  issue_still_visible: 2,
  needs_professional: 3,
}

export function observationRank(label: ObservationLabel): number {
  return OBSERVATION_RANK[label]
}

/** The most severe of several observations. `needs_professional` always wins. */
export function mostSevereObservation(first: ObservationLabel, ...rest: ObservationLabel[]): ObservationLabel {
  return rest.reduce((worst, next) => (OBSERVATION_RANK[next] > OBSERVATION_RANK[worst] ? next : worst), first)
}

/** Offline is an error, never an observation. */
export function errorKindFor(error: unknown, online: boolean): ComparisonErrorKind {
  if (!online) return 'offline'
  if (error instanceof Error && /failed to fetch|networkerror|network request failed|load failed/i.test(error.message)) {
    return 'offline'
  }
  return 'failed'
}

const isFinished = (state: ComparisonState) =>
  state.kind === 'observed' || state.kind === 'inconclusive' || state.kind === 'error'

/**
 * Next state. Events that do not fit the current state are ignored, so the screen
 * can never jump to a result without a comparison, or start without both photos.
 */
export function comparisonReducer(state: ComparisonState, event: ComparisonEvent): ComparisonState {
  switch (event.type) {
    case 'inputs':
      // While a comparison is running the photos are locked; ignore changes.
      if (state.kind === 'comparing') return state
      return inputState(event.hasBefore, event.hasAfter)
    case 'start':
      return canStartComparison(state) ? { kind: 'comparing', stage: 'preparing' } : state
    case 'stage': {
      if (state.kind !== 'comparing') return state
      // Stages only move forward.
      const current = COMPARISON_STAGES.indexOf(state.stage)
      const next = COMPARISON_STAGES.indexOf(event.stage)
      return next > current ? { kind: 'comparing', stage: event.stage } : state
    }
    case 'observed': {
      if (state.kind !== 'comparing') return state
      const observation = observationForStatus(event.status)
      // An unrecognised status is an unusable response, not an observation.
      return observation ? { kind: 'observed', observation } : { kind: 'error', error: 'invalid_response' }
    }
    case 'inconclusive':
      return state.kind === 'comparing' ? { kind: 'inconclusive' } : state
    case 'error':
      // A comparison can fail while running, or be refused before it starts
      // (for example: offline, or no comparison service available).
      if (state.kind === 'comparing' || state.kind === 'ready' || isFinished(state)) {
        return { kind: 'error', error: event.error }
      }
      return state
    default:
      return state
  }
}

/** i18n key for each observation label. */
export function observationLabelKey(label: ObservationLabel): string {
  return `verify.observation.${label}`
}

/** i18n key for each error kind. */
export function errorMessageKey(error: ComparisonErrorKind): string {
  return `verify.errorPanel.${error}`
}

/** i18n key for each progress stage. */
export function stageLabelKey(stage: ComparisonStage): string {
  return `verify.progress.${stage}`
}
