// Diagnosis persistence: saves a fresh diagnosis as appliance -> diagnosis -> repair
// session rows for the signed-in user, and mirrors the ids into the browser cache.
//
// Moved out of the Diagnosis page unchanged (Phase 3, checkpoint 1). The page keeps the
// session validity check, the per-attempt deduplication, React state, the cancelled flag
// and navigation. This module has no React, navigation or UI state.
//
// Every error is thrown to the caller, which decides how to present it.

import type { RepairSession } from '../types/repair'
import { supabase } from '../lib/supabase'
import { capText, MAX_ISSUE_NAME_LENGTH, sessionDetailsForInsert, stripPhotoData } from './sessionResume'
import { persistImagePath } from './repairSessionDb'
import { linkPhoto } from './localPhotoStore'

export interface DiagnosisSaveInput {
  /** The attempt id the photo was stored under at capture. */
  attemptId: string
  diagnosis: RepairSession['diagnosis']
  description: RepairSession['description']
  /** The persistence ids known when the page opened (used only if they belong to the user). */
  diagnosisPersistence: RepairSession['diagnosisPersistence']
}

export interface DiagnosisSaveDeps {
  /** Reads the current browser cache (the photo upload path may arrive during the save). */
  readCache: () => Pick<RepairSession, 'mediaPaths'> | null
  /** Merges fields into the browser cache. */
  writeCache: (partial: Partial<RepairSession>) => void
  /**
   * True once nobody is waiting for this save any more (the page was left). Checked
   * before each database step; see checkpoint() below. Omitted means never cancelled.
   */
  isCancelled?: () => boolean
  /**
   * D9: told when a row-creating/changing request (insert or backfill) starts (true) and
   * settles (false). While one is in flight, the caller must not start a competing save,
   * because the database may still commit it. Omitted means nobody needs to know.
   */
  onWriteInFlight?: (inFlight: boolean) => void
}

/**
 * D7: the failures this workflow detects itself, as stable codes. The page maps each code
 * to translated copy (diagnosis.saveError.*); the message is the code, never shown.
 * Database/Supabase errors are passed through unchanged and get the generic copy.
 */
export type DiagnosisSaveErrorCode =
  | 'signInRequired'
  | 'applianceUnverified'
  | 'duplicateAppliances'
  | 'duplicateSessions'
  | 'sessionMissingAppliance'
  | 'sessionApplianceMismatch'
  | 'sessionLinkMismatch'
  | 'sessionNotUpdated'
  /** The diagnosis already has a finished repair (D14); `repairSessionId` names it. */
  | 'sessionCompleted'
  /** D17: the session insert hit the (user_id, diagnosis_id) unique index (23505). */
  | 'sessionAlreadyExists'
  /** Raised by the page's wait limit (D9), not by this module. */
  | 'timedOut'

export class DiagnosisSaveError extends Error {
  readonly code: DiagnosisSaveErrorCode
  /** For sessionCompleted: the owner's finished repair row (already ownership-scoped). */
  readonly repairSessionId?: string

  constructor(code: DiagnosisSaveErrorCode, details: { repairSessionId?: string } = {}) {
    super(code)
    this.name = 'DiagnosisSaveError'
    this.code = code
    this.repairSessionId = details.repairSessionId
  }
}

/** The save stopped because the page was left; nothing failed. */
export class DiagnosisSaveCancelledError extends Error {
  constructor() {
    super('The diagnosis save was cancelled.')
    this.name = 'DiagnosisSaveCancelledError'
  }
}

export async function saveDiagnosisAndSession(
  input: DiagnosisSaveInput,
  deps: DiagnosisSaveDeps
): Promise<void> {
  const { attemptId } = input
  const { readCache, writeCache, isCancelled, onWriteInFlight } = deps

  // D9: wraps each insert/backfill so the caller knows a write may still commit.
  const write = async <T,>(run: () => PromiseLike<T>): Promise<T> => {
    onWriteInFlight?.(true)
    try {
      return await run()
    } finally {
      onWriteInFlight?.(false)
    }
  }

  // D4: once the page is gone, start no further database step (lookup, verification,
  // insert or update). A write already in flight cannot be undone, so its id is still
  // recorded in the cache when it returns: otherwise a later attempt would create a
  // duplicate row. Once the repair-session row exists, its local follow-up (cache,
  // on-device photo link, late photo path) is finished too.
  const checkpoint = () => {
    if (isCancelled?.()) throw new DiagnosisSaveCancelledError()
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) throw authError
  // The page only starts a save for a signed-in user, so this is the server-side check
  // (e.g. an expired session) rather than the guest path.
  if (!user) throw new DiagnosisSaveError('signInRequired')

  const d = input.diagnosis
  // input.diagnosis has passed isValidDiagnosisResult (the page's isValidDiagnosisSession),
  // which requires a non-empty trimmed issue name, so issueLabel is never empty here.
  const issueLabel = d.issueName.trim()

  let persistence =
    input.diagnosisPersistence?.userId === user.id
      ? { ...input.diagnosisPersistence }
      : { userId: user.id }
  writeCache({ diagnosisAttemptId: attemptId, diagnosisPersistence: persistence })

  let applianceId = persistence.applianceId
  checkpoint()
  if (applianceId) {
    const { data: appliance, error } = await supabase
      .from('appliances')
      .select('id')
      .eq('id', applianceId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error
    if (!appliance) throw new DiagnosisSaveError('applianceUnverified')
  } else {
    // D12 decision: appliances.name / appliance_type are NOT capped. They are the lookup
    // key (an exact match on the full issue name). Capping them would stop existing rows
    // with longer names from matching (creating duplicates) and would merge different
    // issues that share their first 80 characters. Left as is until a migration decides.
    const { data: matchingAppliances, error: findApplianceError } =
      await supabase
        .from('appliances')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', issueLabel)
        .eq('appliance_type', issueLabel)
        .limit(2)

    if (findApplianceError) throw findApplianceError
    if (matchingAppliances.length > 1) {
      // Duplicate appliances must be resolved before this diagnosis can be saved.
      throw new DiagnosisSaveError('duplicateAppliances')
    }

    if (matchingAppliances.length === 1) {
      applianceId = matchingAppliances[0].id
    } else {
      checkpoint()
      const { data: newAppliance, error: createApplianceError } = await write(() =>
        supabase
          .from('appliances')
          .insert({
            user_id: user.id,
            name: issueLabel,
            appliance_type: issueLabel,
          })
          .select('id')
          .single()
      )

      if (createApplianceError) throw createApplianceError
      applianceId = newAppliance.id
    }

    persistence = { ...persistence, applianceId }
    writeCache({ diagnosisAttemptId: attemptId, diagnosisPersistence: persistence })
  }

  let diagnosisId = persistence.diagnosisId
  checkpoint()
  if (diagnosisId) {
    const { data: diagnosis, error } = await supabase
      .from('diagnoses')
      .select('id')
      .eq('id', diagnosisId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error
    if (!diagnosis) diagnosisId = undefined
  }

  if (!diagnosisId) {
    checkpoint()
    const { data: diagnosisRow, error: diagnosisError } = await write(() =>
      supabase
        .from('diagnoses')
        .insert({
          user_id: user.id,
          // D12: display-only columns (DiagnosisHistory, completed-repair summary), capped
          // like repair_sessions.title. Neither is a lookup key.
          appliance_type: capText(issueLabel, MAX_ISSUE_NAME_LENGTH),
          issue_title: capText(d.issueName, MAX_ISSUE_NAME_LENGTH),
          // D2: the same safe diagnosis the repair_sessions row stores (sessionDetailsForInsert):
          // known fields only, photo data and long base64 runs removed, guideSteps re-validated.
          diagnosis_result: stripPhotoData(d),
        })
        .select('id')
        .single()
    )

    if (diagnosisError) throw diagnosisError
    diagnosisId = diagnosisRow.id
    persistence = { ...persistence, diagnosisId }
    writeCache({ diagnosisAttemptId: attemptId, diagnosisPersistence: persistence })
  }

  checkpoint()
  const { data: existingSessions, error: findSessionError } = await supabase
    .from('repair_sessions')
    .select('id, appliance_id, status')
    .eq('user_id', user.id)
    .eq('diagnosis_id', diagnosisId)
    .limit(2)

  if (findSessionError) throw findSessionError
  if (existingSessions.length > 1) {
    throw new DiagnosisSaveError('duplicateSessions')
  }

  // S06: the repair_sessions row is the single source of truth, so it
  // carries the full payload (diagnosis/steps/issue_name/current_step)
  // from creation — not just the appliance/diagnosis links. This is the
  // same row later used for step progress, completion, AND reload
  // rehydration, so there is exactly one row per repair.
  // V06: photo/image data is stripped from the stored diagnosis, the
  // description is capped at 500 and the title at 80 characters.
  // V05: generated steps (AI guideSteps or steps built from the diagnosis) are not
  // approved content and are never persisted, so steps is always empty here.
  const safeDetails = sessionDetailsForInsert(d, input.description)
  // The photo is uploaded to private storage in parallel with this save. When it is
  // already there, its PATH (never image data) is stored with the row.
  const insertedImagePath = readCache()?.mediaPaths?.[0]
  const authoritativeFields = {
    title: safeDetails.title,
    issue_name: safeDetails.issue_name,
    description: safeDetails.description,
    diagnosis: safeDetails.diagnosis,
    steps: [],
    current_step: 0,
    ...(insertedImagePath ? { image_path: insertedImagePath } : {}),
  }

  checkpoint()
  const existingSession = existingSessions[0]
  if (existingSession) {
    if (existingSession.appliance_id === null) {
      // Left unchanged; the row needs review in Supabase before a retry can succeed.
      throw new DiagnosisSaveError('sessionMissingAppliance')
    } else if (existingSession.appliance_id !== applianceId) {
      throw new DiagnosisSaveError('sessionApplianceMismatch')
    }
    // D14: this diagnosis already has a FINISHED repair. It is never written to (no
    // downgrade, no overwrite) and is not linked to this attempt; the page offers to open
    // it or start a new scan instead of a retry that could never succeed.
    if (existingSession.status === 'completed') {
      throw new DiagnosisSaveError('sessionCompleted', { repairSessionId: existingSession.id })
    }
    // Backfill the authoritative payload on a pre-S06 row that may only
    // have the links. Never downgrade a completed row back to in_progress.
    // D6: the changed row is returned (same pattern as completedRepair and
    // commitCurrentStep). Zero rows (a completed row, or one RLS hides) comes back as
    // null, not as an error, and must not count as saved.
    const { data: backfilledSession, error: backfillError } = await write(() =>
      supabase
        .from('repair_sessions')
        .update(authoritativeFields)
        .eq('id', existingSession.id)
        .eq('user_id', user.id)
        .eq('status', 'in_progress')
        .select('id')
        .maybeSingle()
    )
    if (backfillError) throw backfillError
    if (!backfilledSession || backfilledSession.id !== existingSession.id) {
      // Possibly already completed, or not available to this account.
      throw new DiagnosisSaveError('sessionNotUpdated')
    }
    persistence = { ...persistence, repairSessionId: existingSession.id }
    writeCache({
      diagnosisAttemptId: attemptId,
      diagnosisPersistence: persistence,
      historySessionId: existingSession.id,
      steps: [],
      currentStep: 0,
    })
  } else {
    const { data: createdSession, error: createSessionError } = await write(() =>
      supabase
        .from('repair_sessions')
        .insert({
          user_id: user.id,
          appliance_id: applianceId,
          diagnosis_id: diagnosisId,
          status: 'in_progress',
          // Stripped diagnosis, capped text, no generated steps (see above).
          ...authoritativeFields,
        })
        .select('id, user_id, diagnosis_id, appliance_id')
        .single()
    )

    // D17 (prepared, dormant until the unique index on repair_sessions (user_id,
    // diagnosis_id) exists): Postgres unique_violation means a session for this diagnosis
    // was already committed (a lost response or a parallel save). Nothing was inserted;
    // a retry verifies the ids (D1), finds that row and reuses it, so no duplicate.
    if (createSessionError?.code === '23505') throw new DiagnosisSaveError('sessionAlreadyExists')
    if (createSessionError) throw createSessionError
    if (
      createdSession.user_id !== user.id ||
      createdSession.diagnosis_id !== diagnosisId ||
      createdSession.appliance_id !== applianceId
    ) {
      throw new DiagnosisSaveError('sessionLinkMismatch')
    }
    persistence = { ...persistence, repairSessionId: createdSession.id }
    writeCache({
      diagnosisAttemptId: attemptId,
      diagnosisPersistence: persistence,
      historySessionId: createdSession.id,
      steps: [],
      currentStep: 0,
    })
  }

  // The on-device photo was saved under the attempt id at capture. Link it to the
  // repair row id too, so a resume from History finds it on this device.
  if (persistence.repairSessionId) {
    // D5: still fire-and-forget (the save does not wait for it), but a failure is reported
    // as a warning. It never fails the saved diagnosis.
    void linkPhoto(attemptId, persistence.repairSessionId, user.id).catch((linkError: unknown) => {
      console.warn('Unable to link the on-device photo:', linkError instanceof Error ? linkError.message : 'unknown')
    })
  }

  // If the upload finished after the row was written, record the path now. A
  // failure here must never turn a saved diagnosis into a "could not save" state.
  const latestImagePath = readCache()?.mediaPaths?.[0]
  if (latestImagePath && latestImagePath !== insertedImagePath && persistence.repairSessionId) {
    try {
      await persistImagePath(persistence.repairSessionId, latestImagePath)
    } catch (photoError) {
      console.warn('Unable to record the photo reference:', photoError instanceof Error ? photoError.message : 'unknown')
    }
  }
}
