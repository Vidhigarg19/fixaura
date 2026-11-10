import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../src/App'
import { setLocale, t } from '../src/i18n'
import { claimGuestSession, getSession, saveSession } from '../src/services/repairSession'
import { linkPhoto } from '../src/services/localPhotoStore'
import type { RepairStep } from '../src/types/repair'
import {
  calls,
  callsTo,
  deferred,
  on,
  once,
  resetFake,
  setGetUserError,
  setUser,
  supabase as fakeSupabase,
  unexpected,
  type FakeResult,
  type RecordedCall,
} from './helpers/persistenceFake'
import { currentPath, renderAppAt } from './helpers/renderApp'
import { makeDiagnosis, seedSession } from './helpers/fixtures'

vi.mock('../src/lib/supabase', async () => ({ supabase: (await import('./helpers/persistenceFake')).supabase }))
vi.mock('../src/lib/test-supabase', () => ({ testSupabaseConnection: vi.fn(async () => true) }))
// The real on-device photo store (it fails soft: jsdom has no IndexedDB), wrapped so the
// call can be observed and made to fail.
vi.mock('../src/services/localPhotoStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/localPhotoStore')>()
  return { ...actual, linkPhoto: vi.fn(actual.linkPhoto) }
})

// CHARACTERIZATION of the current Diagnosis persistence workflow (FreshDiagnosis save
// effect, useDiagnosisSource rehydrate, SavedDiagnosis load). These tests pin what the
// code does TODAY, including behaviour listed as a defect in the Phase 3 report. They are
// the safety net for extracting the save into a service; they do not describe a target.

const USER = { id: 'user-1', email: 'tester@example.test' }
const OTHER_USER_ID = 'user-2'
const SESSION_ID = '3f2b8a4e-1c5d-4e6f-8a9b-0c1d2e3f4a5b'
const APPLIANCE_ID = 'appliance-1'
const DIAGNOSIS_ID = 'diagnosis-1'
const ATTEMPT_ID = 'attempt-1'

// The exact column list repairSessionDb uses for rehydration (copied on purpose: a change
// there must be noticed here).
const REHYDRATE_COLUMNS =
  'id, user_id, appliance_id, diagnosis_id, title, description, issue_name, diagnosis, steps, current_step, status, image_path, symptom_answers, observation, created_at, updated_at, completed_at'

const STEPS: RepairStep[] = [1, 2, 3, 4].map((n) => ({
  id: `step-${n}`,
  title: `Generated step ${n}`,
  instruction: `Do generated thing number ${n} carefully.`,
  safetyNote: '',
  requiresConfirmation: false,
  visualCue: 'circle',
  estimatedSeconds: 60,
}))

const linkPhotoMock = vi.mocked(linkPhoto)
let consoleError: MockInstance<(...args: unknown[]) => void>
let consoleWarn: MockInstance<(...args: unknown[]) => void>

beforeEach(() => {
  resetFake()
  setUser(USER)
  linkPhotoMock.mockClear()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  // Strict fake: every Supabase call in every test must have been scripted.
  expect(unexpected).toEqual([])
  consoleError.mockRestore()
  consoleWarn.mockRestore()
})

// ---- scripting helpers ----

/** Rehydration on mount: no active row in the database. */
function rehydrateFindsNothing() {
  on({ table: 'repair_sessions', op: 'select', columns: REHYDRATE_COLUMNS }, { data: null })
}

/** The chain lookups of the save, without the final repair_sessions write. */
function scriptLookups({
  appliances = [] as Array<{ id: string }>,
  sessions = [] as Array<{ id: string; appliance_id: string | null }>,
} = {}) {
  on({ table: 'appliances', op: 'select', columns: 'id', where: (c) => c.limit === 2 }, { data: appliances })
  on({ table: 'appliances', op: 'insert', returning: 'id' }, { data: { id: APPLIANCE_ID } })
  on({ table: 'diagnoses', op: 'insert', returning: 'id' }, { data: { id: DIAGNOSIS_ID } })
  on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: sessions })
}

/** The insert echoes the links the database would store. */
function createdRow(call: RecordedCall): FakeResult {
  const payload = call.payload as Record<string, unknown>
  return {
    data: {
      id: SESSION_ID,
      user_id: payload.user_id,
      diagnosis_id: payload.diagnosis_id,
      appliance_id: payload.appliance_id,
    },
  }
}

/** After navigation to ?session=<id> the page loads the saved row (SavedDiagnosis). */
function scriptSavedLoad(row: () => Record<string, unknown>) {
  on({ table: 'repair_sessions', op: 'select', columns: '*' }, () => ({ data: row() }))
  on({ table: 'chat_messages', op: 'select', columns: 'id' }, { count: 0 })
}

/** The row the database now holds, built from the recorded insert/update payload. */
function storedRow(): Record<string, unknown> {
  // Writes are applied in order: the insert or backfill, then any later image_path update.
  const writes = callsTo('repair_sessions').filter((c) => c.op === 'insert' || c.op === 'update')
  return Object.assign(
    { id: SESSION_ID, user_id: USER.id, status: 'in_progress', updated_at: null },
    ...writes.map((c) => c.payload as Record<string, unknown>)
  )
}

function scriptHappyPath(options: Parameters<typeof scriptLookups>[0] = {}) {
  rehydrateFindsNothing()
  scriptLookups(options)
  on({ table: 'repair_sessions', op: 'insert', returning: 'id, user_id, diagnosis_id, appliance_id' }, createdRow)
  scriptSavedLoad(storedRow)
}

/** The save's own calls, in order (excludes the rehydrate read and the saved-view load). */
function saveCalls() {
  return calls.filter(
    (c) =>
      !(c.table === 'repair_sessions' && c.op === 'select' && (c.columns === REHYDRATE_COLUMNS || c.columns === '*')) &&
      c.table !== 'chat_messages'
  )
}

function summary(c: RecordedCall) {
  return `${c.table}.${c.op}:${c.terminal}`
}

/** Lets pending promise chains run, so "nothing more happened" can be asserted. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 30))
}

async function expectSavedAndReopened() {
  await waitFor(() => expect(currentPath()).toBe(`/diagnosis?session=${SESSION_ID}`))
  // The page switches to SavedDiagnosis and reloads the row from the database.
  expect(await screen.findByText(t('session.backToHistory'))).toBeTruthy()
}

async function expectSaveFailed(message?: string) {
  expect(await screen.findByText(t('diagnosis.saveStatus.failed'))).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain(t('session.notSaved'))
  expect(currentPath()).toBe('/diagnosis')
  const logged = consoleError.mock.calls.find((args) => args[0] === 'Diagnosis save failed:')
  expect(logged).toBeTruthy()
  if (message !== undefined) expect((logged?.[1] as Error).message).toBe(message)
}

// ---- signed-in save: new rows ----

describe('signed-in save creates appliance, diagnosis and repair session', () => {
  it('writes the current payload contract in order and reopens the saved row', async () => {
    seedSession()
    scriptHappyPath()
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(saveCalls().map(summary)).toEqual([
      'appliances.select:await',
      'appliances.insert:single',
      'diagnoses.insert:single',
      'repair_sessions.select:await',
      'repair_sessions.insert:single',
    ])
    const [findAppliance, createAppliance, createDiagnosis, findSession, createSession] = saveCalls()

    expect(findAppliance).toMatchObject({
      columns: 'id',
      filters: [['user_id', USER.id], ['name', 'Dripping tap'], ['appliance_type', 'Dripping tap']],
      limit: 2,
    })
    expect(createAppliance.payload).toEqual({ user_id: USER.id, name: 'Dripping tap', appliance_type: 'Dripping tap' })
    expect(createDiagnosis.payload).toEqual({
      user_id: USER.id,
      appliance_type: 'Dripping tap',
      issue_title: 'Dripping tap',
      diagnosis_result: makeDiagnosis(),
    })
    expect(findSession).toMatchObject({
      filters: [['user_id', USER.id], ['diagnosis_id', DIAGNOSIS_ID]],
      limit: 2,
    })
    expect(createSession.payload).toEqual({
      user_id: USER.id,
      appliance_id: APPLIANCE_ID,
      diagnosis_id: DIAGNOSIS_ID,
      status: 'in_progress',
      title: 'Dripping tap',
      issue_name: 'Dripping tap',
      description: 'The kitchen tap keeps dripping when closed.',
      diagnosis: makeDiagnosis(),
      steps: [],
      current_step: 0,
    })
    expect(createSession.payload).not.toHaveProperty('image_path')

    // The on-device photo is linked from the attempt id to the new row id.
    expect(linkPhotoMock).toHaveBeenCalledWith(ATTEMPT_ID, SESSION_ID, USER.id)

    // Cache: the ids are kept; the saved-view load then mirrors the row and drops steps.
    expect(getSession()).toMatchObject({
      ownerUserId: USER.id,
      diagnosisAttemptId: ATTEMPT_ID,
      historySessionId: SESSION_ID,
      diagnosisPersistence: {
        userId: USER.id,
        applianceId: APPLIANCE_ID,
        diagnosisId: DIAGNOSIS_ID,
        repairSessionId: SESSION_ID,
      },
      currentStep: 0,
    })
    expect(getSession()?.steps).toBeUndefined()
  })

  it('reloads the saved row scoped to the id and the signed-in user', async () => {
    seedSession()
    scriptHappyPath()
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    const load = calls.find((c) => c.table === 'repair_sessions' && c.columns === '*')
    expect(load).toMatchObject({ filters: [['id', SESSION_ID], ['user_id', USER.id]], terminal: 'maybeSingle' })
    expect(callsTo('chat_messages')[0]).toMatchObject({
      selectOptions: { count: 'exact', head: true },
      filters: [['session_id', SESSION_ID], ['user_id', USER.id]],
    })
  })

  it('stores the stripped diagnosis with the title capped at 80 and the description at 500', async () => {
    const longName = `Leaking ${'pipe '.repeat(30)}`.trim()
    const diagnosis = { ...makeDiagnosis({ issueName: longName }), imageDataUrl: 'data:image/png;base64,AAAA' }
    seedSession({}, { diagnosis, description: 'd'.repeat(700) })
    scriptHappyPath()
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    const createSession = callsTo('repair_sessions', 'insert')[0]
    const payload = createSession.payload as Record<string, unknown>
    expect(Array.from(payload.title as string)).toHaveLength(80)
    expect(payload.issue_name).toBe(payload.title)
    expect(payload.description).toBe('d'.repeat(500))
    expect(payload.diagnosis).not.toHaveProperty('imageDataUrl')
    // D13: the stored issue name is capped like the title, with a visible "…".
    const storedName = (payload.diagnosis as { issueName: string }).issueName
    expect(Array.from(storedName)).toHaveLength(80)
    expect(storedName.endsWith('…')).toBe(true)
    expect(longName.startsWith(storedName.slice(0, -1))).toBe(true)
    expect(payload.title).toBe(storedName)

    // The appliance name is NOT capped (it is also the lookup key; D12 decision). D2: the
    // diagnoses row gets the same stripped diagnosis as the repair_sessions row.
    expect(callsTo('appliances', 'insert')[0].payload).toMatchObject({ name: longName, appliance_type: longName })
    expect(callsTo('diagnoses', 'insert')[0].payload).toMatchObject({ issue_title: storedName, appliance_type: storedName })
    const diagnosisResult = (callsTo('diagnoses', 'insert')[0].payload as Record<string, unknown>).diagnosis_result
    expect(diagnosisResult).not.toHaveProperty('imageDataUrl')
    expect(diagnosisResult).toEqual(payload.diagnosis)
  })

  it('reuses exactly one matching appliance instead of creating one', async () => {
    seedSession()
    scriptHappyPath({ appliances: [{ id: 'appliance-existing' }] })
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(callsTo('appliances', 'insert')).toHaveLength(0)
    expect(callsTo('repair_sessions', 'insert')[0].payload).toMatchObject({ appliance_id: 'appliance-existing' })
    expect(getSession()?.diagnosisPersistence?.applianceId).toBe('appliance-existing')
  })
})

// ---- V05: generated steps ----

describe('generated steps are never persisted or seeded as guide steps', () => {
  it('saves steps: [] while the AI guideSteps stay inside the stored diagnosis JSON only', async () => {
    seedSession({ guideSteps: STEPS })
    scriptHappyPath()
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    const payload = callsTo('repair_sessions', 'insert')[0].payload as Record<string, unknown>
    expect(payload.steps).toEqual([])
    expect(payload.current_step).toBe(0)
    // Stored as part of the diagnosis record (data), not as executable steps.
    expect((payload.diagnosis as { guideSteps?: RepairStep[] }).guideSteps).toHaveLength(STEPS.length)
    expect(getSession()?.steps).toBeUndefined()
    expect(screen.queryByText(t('diagnosis.ctaTools'))).toBeNull()
    for (const step of STEPS) expect(screen.queryByText(step.title)).toBeNull()
  })

  it('backfills an existing row with steps: [] as well', async () => {
    seedSession({ guideSteps: STEPS })
    rehydrateFindsNothing()
    scriptLookups({ sessions: [{ id: SESSION_ID, appliance_id: APPLIANCE_ID }] })
    // D6: the backfill now returns the changed row; one row changed is the success case.
    on({ table: 'repair_sessions', op: 'update', returning: 'id' }, { data: { id: SESSION_ID } })
    scriptSavedLoad(storedRow)
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    const payload = callsTo('repair_sessions', 'update')[0].payload as Record<string, unknown>
    expect(payload.steps).toEqual([])
    expect(payload.current_step).toBe(0)
  })

  it('rehydration restores the durable fields but never copies DB steps into the cache (D8 fixed)', async () => {
    // No photo in the cache, so the save effect does not run; only rehydration does.
    // The cache is the shape a saved-session view leaves behind (writeVerifiedSessionToCache:
    // a history id, no attempt). D11: it is reloaded by that history id (it used to fall
    // back to the latest active repair). A fresh, unlinked attempt is not rehydrated (D10).
    saveSession({
      diagnosis: makeDiagnosis(),
      ownerUserId: USER.id,
      historySessionId: SESSION_ID,
      description: 'Cached description',
    })
    on(
      { table: 'repair_sessions', op: 'select', columns: REHYDRATE_COLUMNS },
      {
        data: {
          id: SESSION_ID,
          user_id: USER.id,
          appliance_id: APPLIANCE_ID,
          diagnosis_id: DIAGNOSIS_ID,
          diagnosis: makeDiagnosis(),
          description: 'Stored description',
          steps: STEPS,
          current_step: 2,
          status: 'in_progress',
        },
      }
    )
    renderAppAt('/diagnosis')

    await waitFor(() => expect(getSession()?.diagnosisPersistence?.repairSessionId).toBe(SESSION_ID))
    expect(getSession()?.steps).toBeUndefined()
    for (const step of STEPS) expect(screen.queryByText(step.title)).toBeNull()
    expect(getSession()).toMatchObject({
      description: 'Stored description',
      currentStep: 2,
      historySessionId: SESSION_ID,
      diagnosisPersistence: { repairSessionId: SESSION_ID, applianceId: APPLIANCE_ID, diagnosisId: DIAGNOSIS_ID },
    })
    expect(callsTo('repair_sessions')).toEqual([
      expect.objectContaining({
        filters: [['id', SESSION_ID], ['user_id', USER.id]],
        terminal: 'maybeSingle',
      }),
    ])
    expect(callsTo('repair_sessions')[0].order).toBeUndefined()
    expect(callsTo('appliances')).toHaveLength(0)
    expect(screen.queryByText(t('diagnosis.ctaTools'))).toBeNull()
  })
})

// ---- existing rows ----

describe('existing rows are verified and backfilled', () => {
  it('verifies cached appliance and diagnosis ids for the same user instead of re-creating them', async () => {
    seedSession({}, { diagnosisPersistence: { userId: USER.id, applianceId: APPLIANCE_ID, diagnosisId: DIAGNOSIS_ID } })
    rehydrateFindsNothing()
    on({ table: 'appliances', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    on({ table: 'repair_sessions', op: 'insert' }, createdRow)
    scriptSavedLoad(storedRow)
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(saveCalls().map(summary)).toEqual([
      'appliances.select:maybeSingle',
      'diagnoses.select:maybeSingle',
      'repair_sessions.select:await',
      'repair_sessions.insert:single',
    ])
    expect(callsTo('appliances')[0].filters).toEqual([['id', APPLIANCE_ID], ['user_id', USER.id]])
    expect(callsTo('diagnoses')[0].filters).toEqual([['id', DIAGNOSIS_ID], ['user_id', USER.id]])
  })

  it('re-creates the diagnosis when the cached diagnosis id is not found', async () => {
    seedSession({}, { diagnosisPersistence: { userId: USER.id, applianceId: APPLIANCE_ID, diagnosisId: 'gone' } })
    rehydrateFindsNothing()
    on({ table: 'appliances', op: 'select', terminal: 'maybeSingle' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'select', terminal: 'maybeSingle' }, { data: null })
    on({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    on({ table: 'repair_sessions', op: 'insert' }, createdRow)
    scriptSavedLoad(storedRow)
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
    expect(getSession()?.diagnosisPersistence?.diagnosisId).toBe(DIAGNOSIS_ID)
  })

  it('ignores cached persistence ids that belong to another user', async () => {
    seedSession({}, { diagnosisPersistence: { userId: OTHER_USER_ID, applianceId: 'theirs', diagnosisId: 'theirs' } })
    scriptHappyPath()
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(callsTo('appliances')[0].limit).toBe(2)
    expect(calls.some((c) => c.filters.some(([, value]) => value === 'theirs'))).toBe(false)
    expect(getSession()?.diagnosisPersistence).toMatchObject({ userId: USER.id, applianceId: APPLIANCE_ID })
  })

  it('backfills the existing in_progress row for the diagnosis and does not insert', async () => {
    seedSession({}, { mediaPaths: ['user-1/attempt-1/photo.jpg'] })
    rehydrateFindsNothing()
    scriptLookups({ sessions: [{ id: SESSION_ID, appliance_id: APPLIANCE_ID }] })
    on({ table: 'repair_sessions', op: 'update', returning: 'id' }, { data: { id: SESSION_ID } })
    scriptSavedLoad(storedRow)
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(callsTo('repair_sessions', 'insert')).toHaveLength(0)
    const [backfill] = callsTo('repair_sessions', 'update')
    // Same filters as before; D6 adds the returned row (select('id').maybeSingle()).
    expect(backfill).toMatchObject({
      filters: [['id', SESSION_ID], ['user_id', USER.id], ['status', 'in_progress']],
      returning: 'id',
      terminal: 'maybeSingle',
    })
    expect(backfill.payload).toEqual({
      title: 'Dripping tap',
      issue_name: 'Dripping tap',
      description: 'The kitchen tap keeps dripping when closed.',
      diagnosis: makeDiagnosis(),
      steps: [],
      current_step: 0,
      image_path: 'user-1/attempt-1/photo.jpg',
    })
    expect(getSession()?.diagnosisPersistence?.repairSessionId).toBe(SESSION_ID)
  })
})

// ---- photo path ----

describe('photo path linking', () => {
  it('includes image_path in the insert when the upload path is already cached', async () => {
    seedSession({}, { mediaPaths: ['user-1/attempt-1/photo.jpg'] })
    scriptHappyPath()
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(callsTo('repair_sessions', 'insert')[0].payload).toMatchObject({ image_path: 'user-1/attempt-1/photo.jpg' })
    expect(callsTo('repair_sessions', 'update')).toHaveLength(0)
  })

  it('records a path that arrived after the insert with a separate scoped update', async () => {
    seedSession()
    rehydrateFindsNothing()
    scriptLookups()
    on({ table: 'repair_sessions', op: 'insert' }, (call) => {
      // The upload finishes while the insert is in flight.
      saveSession({ mediaPaths: ['user-1/attempt-1/late.jpg'] })
      return createdRow(call)
    })
    // D15: the update returns the changed row; one row changed is the success case.
    on({ table: 'repair_sessions', op: 'update' }, { data: { id: SESSION_ID } })
    scriptSavedLoad(storedRow)
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(callsTo('repair_sessions', 'insert')[0].payload).not.toHaveProperty('image_path')
    expect(callsTo('repair_sessions', 'update')).toEqual([
      expect.objectContaining({
        payload: { image_path: 'user-1/attempt-1/late.jpg' },
        filters: [['id', SESSION_ID], ['user_id', USER.id]],
        returning: 'id',
        terminal: 'maybeSingle',
      }),
    ])
    expect(consoleWarn.mock.calls.some((args) => args[0] === 'Unable to record the photo reference:')).toBe(false)
  })

  it('a late image_path update that changes no row is only a warning; the diagnosis still counts as saved (D15)', async () => {
    seedSession()
    rehydrateFindsNothing()
    scriptLookups()
    on({ table: 'repair_sessions', op: 'insert' }, (call) => {
      saveSession({ mediaPaths: ['user-1/attempt-1/late.jpg'] })
      return createdRow(call)
    })
    on({ table: 'repair_sessions', op: 'update' }, { data: null })
    scriptSavedLoad(storedRow)
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(consoleWarn).toHaveBeenCalledWith(
      'Unable to record the photo reference:',
      'Unable to save the photo reference: the repair was not changed (not found or not available).'
    )
    expect(consoleError.mock.calls.some((args) => args[0] === 'Diagnosis save failed:')).toBe(false)
  })

  it('a failed late image_path update is only a warning; the diagnosis still counts as saved', async () => {
    seedSession()
    rehydrateFindsNothing()
    scriptLookups()
    on({ table: 'repair_sessions', op: 'insert' }, (call) => {
      saveSession({ mediaPaths: ['user-1/attempt-1/late.jpg'] })
      return createdRow(call)
    })
    on({ table: 'repair_sessions', op: 'update' }, { error: { message: 'permission denied' } })
    scriptSavedLoad(storedRow)
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(consoleWarn).toHaveBeenCalledWith(
      'Unable to record the photo reference:',
      'Unable to save the photo reference: permission denied'
    )
    expect(consoleError.mock.calls.some((args) => args[0] === 'Diagnosis save failed:')).toBe(false)
  })

  it('a rejected on-device photo link is logged as a warning and the diagnosis still counts as saved (D5 fixed)', async () => {
    linkPhotoMock.mockRejectedValueOnce(new Error('quota exceeded'))
    seedSession()
    scriptHappyPath()
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(linkPhotoMock).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls.some((args) => args[0] === 'Diagnosis save failed:')).toBe(false)
    await waitFor(() => expect(consoleWarn).toHaveBeenCalledWith('Unable to link the on-device photo:', 'quota exceeded'))
  })
})

// ---- failure stages ----

interface FailureCase {
  name: string
  setup: () => void
  message: string
  /**
   * D7: the translated reason shown on screen. Omitted for database/auth-provider errors,
   * which get the generic copy (their own text is never shown).
   */
  reasonKey?: string
  /** Calls that must NOT have happened after the failure. */
  notCalled?: Array<[string, RecordedCall['op']]>
}

const dbError = { message: 'db failure', code: 'XX000' }

const FAILURES: FailureCase[] = [
  {
    name: 'auth.getUser returns an error',
    setup: () => {
      setGetUserError(new Error('jwt expired'))
    },
    message: 'jwt expired',
    notCalled: [['appliances', 'select']],
  },
  {
    name: 'the appliance lookup fails',
    setup: () => {
      rehydrateFindsNothing()
      on({ table: 'appliances', op: 'select' }, { error: dbError })
    },
    message: 'db failure',
    notCalled: [['appliances', 'insert']],
  },
  {
    name: 'two appliances match the name',
    setup: () => {
      rehydrateFindsNothing()
      on({ table: 'appliances', op: 'select' }, { data: [{ id: 'a' }, { id: 'b' }] })
    },
    message: 'duplicateAppliances',
    reasonKey: 'diagnosis.saveError.duplicateAppliances',
    notCalled: [['appliances', 'insert'], ['diagnoses', 'insert']],
  },
  {
    name: 'the appliance insert fails',
    setup: () => {
      rehydrateFindsNothing()
      on({ table: 'appliances', op: 'select' }, { data: [] })
      on({ table: 'appliances', op: 'insert' }, { error: dbError })
    },
    message: 'db failure',
    notCalled: [['diagnoses', 'insert']],
  },
  {
    name: 'the diagnosis insert fails',
    setup: () => {
      rehydrateFindsNothing()
      on({ table: 'appliances', op: 'select' }, { data: [] })
      on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
      on({ table: 'diagnoses', op: 'insert' }, { error: dbError })
    },
    message: 'db failure',
    notCalled: [['repair_sessions', 'insert']],
  },
  {
    name: 'the repair session lookup fails',
    setup: () => {
      rehydrateFindsNothing()
      // Handlers match first-registered-first, so the failure is registered before the
      // successful lookups.
      on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { error: dbError })
      scriptLookups()
    },
    message: 'db failure',
    notCalled: [['repair_sessions', 'insert'], ['repair_sessions', 'update']],
  },
  {
    name: 'two repair sessions exist for the diagnosis',
    setup: () => {
      rehydrateFindsNothing()
      scriptLookups({
        sessions: [
          { id: SESSION_ID, appliance_id: APPLIANCE_ID },
          { id: 'second', appliance_id: APPLIANCE_ID },
        ],
      })
    },
    message: 'duplicateSessions',
    reasonKey: 'diagnosis.saveError.duplicateSessions',
    notCalled: [['repair_sessions', 'insert'], ['repair_sessions', 'update']],
  },
  {
    name: 'the existing session has no appliance link',
    setup: () => {
      rehydrateFindsNothing()
      scriptLookups({ sessions: [{ id: SESSION_ID, appliance_id: null }] })
    },
    message: 'sessionMissingAppliance',
    reasonKey: 'diagnosis.saveError.sessionLinkInvalid',
    notCalled: [['repair_sessions', 'update'], ['repair_sessions', 'insert']],
  },
  {
    name: 'the existing session is linked to a different appliance',
    setup: () => {
      rehydrateFindsNothing()
      scriptLookups({ sessions: [{ id: SESSION_ID, appliance_id: 'another-appliance' }] })
    },
    message: 'sessionApplianceMismatch',
    reasonKey: 'diagnosis.saveError.sessionLinkInvalid',
    notCalled: [['repair_sessions', 'update'], ['repair_sessions', 'insert']],
  },
  {
    name: 'the backfill update fails',
    setup: () => {
      rehydrateFindsNothing()
      scriptLookups({ sessions: [{ id: SESSION_ID, appliance_id: APPLIANCE_ID }] })
      on({ table: 'repair_sessions', op: 'update' }, { error: dbError })
    },
    message: 'db failure',
  },
  {
    name: 'the repair session insert fails',
    setup: () => {
      rehydrateFindsNothing()
      scriptLookups()
      on({ table: 'repair_sessions', op: 'insert' }, { error: dbError })
    },
    message: 'db failure',
  },
  {
    name: 'the created row comes back with different links',
    setup: () => {
      rehydrateFindsNothing()
      scriptLookups()
      on({ table: 'repair_sessions', op: 'insert' }, (call) => {
        const row = createdRow(call).data as Record<string, unknown>
        return { data: { ...row, appliance_id: 'not-mine' } }
      })
    },
    message: 'sessionLinkMismatch',
    reasonKey: 'diagnosis.saveError.sessionLinkInvalid',
  },
]

describe('a failure at any persistence stage shows the not-saved state with a retry', () => {
  it.each(FAILURES)('$name', async ({ setup, message, reasonKey = 'diagnosis.saveError.unknown', notCalled = [] }) => {
    seedSession()
    setup()
    renderAppAt('/diagnosis')
    await expectSaveFailed(message)

    // D7: a translated reason is shown; raw error text never is.
    expect(screen.getByRole('alert').textContent).toContain(t(reasonKey))
    expect(screen.getByRole('alert').textContent).not.toContain(message)
    expect(screen.queryByRole('link', { name: t('nav.logIn') })).toBeNull()
    expect(screen.getByRole('button', { name: t('common.retry') })).toBeTruthy()
    for (const [table, op] of notCalled) expect(callsTo(table, op)).toHaveLength(0)
    // No row id is cached and nothing navigates.
    expect(getSession()?.diagnosisPersistence?.repairSessionId).toBeUndefined()
    expect(linkPhotoMock).not.toHaveBeenCalled()
  })

  it('a retry after a session insert failure verifies and reuses the ids it created (D1 fixed)', async () => {
    seedSession()
    rehydrateFindsNothing()
    // First attempt: no appliance yet. The second name-lookup and diagnosis-2 scripts stay
    // available, so a regression to the old re-lookup/re-insert behaviour would succeed
    // and be caught by the assertions below rather than by a missing script.
    once({ table: 'appliances', op: 'select', columns: 'id', where: (c) => c.limit === 2 }, { data: [] })
    once({ table: 'appliances', op: 'select', columns: 'id', where: (c) => c.limit === 2 }, { data: [{ id: APPLIANCE_ID }] })
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    once({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    once({ table: 'diagnoses', op: 'insert' }, { data: { id: 'diagnosis-2' } })
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    once({ table: 'repair_sessions', op: 'insert' }, { error: dbError })
    renderAppAt('/diagnosis')
    await expectSaveFailed('db failure')

    // The partial progress is cached for a retry.
    expect(getSession()?.diagnosisPersistence).toEqual({
      userId: USER.id,
      applianceId: APPLIANCE_ID,
      diagnosisId: DIAGNOSIS_ID,
    })

    on({ table: 'appliances', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'insert' }, createdRow)
    scriptSavedLoad(storedRow)
    const before = saveCalls().length
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))
    await expectSavedAndReopened()

    // The retry verifies the ids it already created (by id AND user) and reuses them.
    expect(saveCalls().slice(before).map(summary)).toEqual([
      'appliances.select:maybeSingle',
      'diagnoses.select:maybeSingle',
      'repair_sessions.select:await',
      'repair_sessions.insert:single',
    ])
    const [verifyAppliance, verifyDiagnosis] = saveCalls().slice(before)
    expect(verifyAppliance.filters).toEqual([['id', APPLIANCE_ID], ['user_id', USER.id]])
    expect(verifyDiagnosis.filters).toEqual([['id', DIAGNOSIS_ID], ['user_id', USER.id]])
    expect(callsTo('appliances', 'insert')).toHaveLength(1)
    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
    expect(callsTo('repair_sessions', 'insert').at(-1)?.payload).toMatchObject({
      diagnosis_id: DIAGNOSIS_ID,
      appliance_id: APPLIANCE_ID,
    })
    expect(getSession()?.diagnosisPersistence).toEqual({
      userId: USER.id,
      applianceId: APPLIANCE_ID,
      diagnosisId: DIAGNOSIS_ID,
      repairSessionId: SESSION_ID,
    })
  })

  it('a cached appliance id that cannot be verified fails the save', async () => {
    seedSession({}, { diagnosisPersistence: { userId: USER.id, applianceId: 'deleted' } })
    rehydrateFindsNothing()
    on({ table: 'appliances', op: 'select', terminal: 'maybeSingle' }, { data: null })
    renderAppAt('/diagnosis')
    await expectSaveFailed('applianceUnverified')
    expect(screen.getByText(t('diagnosis.saveError.applianceUnverified'))).toBeTruthy()
    expect(callsTo('diagnoses')).toHaveLength(0)
  })
})

// ---- D1: retry reuses the ids this attempt already saved ----

describe('a retry reuses the ids this attempt already saved', () => {
  const verifyAppliance = { table: 'appliances', op: 'select', columns: 'id', terminal: 'maybeSingle' } as const
  const verifyDiagnosis = { table: 'diagnoses', op: 'select', columns: 'id', terminal: 'maybeSingle' } as const

  async function retry() {
    const before = saveCalls().length
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))
    return before
  }

  it('reuses the cached appliance id after the diagnosis insert failed', async () => {
    seedSession()
    rehydrateFindsNothing()
    on({ table: 'appliances', op: 'select', columns: 'id', where: (c) => c.limit === 2 }, { data: [] })
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    once({ table: 'diagnoses', op: 'insert' }, { error: dbError })
    renderAppAt('/diagnosis')
    await expectSaveFailed('db failure')

    on(verifyAppliance, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    on({ table: 'repair_sessions', op: 'insert' }, createdRow)
    scriptSavedLoad(storedRow)
    const before = await retry()
    await expectSavedAndReopened()

    expect(saveCalls().slice(before).map(summary)).toEqual([
      'appliances.select:maybeSingle',
      'diagnoses.insert:single',
      'repair_sessions.select:await',
      'repair_sessions.insert:single',
    ])
    expect(callsTo('appliances', 'insert')).toHaveLength(1)
    expect(callsTo('appliances').filter((c) => c.limit === 2)).toHaveLength(1)
  })

  it('reuses the cached diagnosis id after the repair session lookup failed', async () => {
    seedSession()
    rehydrateFindsNothing()
    on({ table: 'appliances', op: 'select', columns: 'id', where: (c) => c.limit === 2 }, { data: [] })
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    once({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { error: dbError })
    renderAppAt('/diagnosis')
    await expectSaveFailed('db failure')

    on(verifyAppliance, { data: { id: APPLIANCE_ID } })
    on(verifyDiagnosis, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    on({ table: 'repair_sessions', op: 'insert' }, createdRow)
    scriptSavedLoad(storedRow)
    const before = await retry()
    await expectSavedAndReopened()

    expect(saveCalls().slice(before).map(summary)).toEqual([
      'appliances.select:maybeSingle',
      'diagnoses.select:maybeSingle',
      'repair_sessions.select:await',
      'repair_sessions.insert:single',
    ])
    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
    expect(callsTo('repair_sessions', 'insert').at(-1)?.payload).toMatchObject({ diagnosis_id: DIAGNOSIS_ID })
  })

  it('a cached diagnosis id that is no longer found is re-created (existing verification path)', async () => {
    seedSession()
    rehydrateFindsNothing()
    on({ table: 'appliances', op: 'select', columns: 'id', where: (c) => c.limit === 2 }, { data: [] })
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    once({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    once({ table: 'repair_sessions', op: 'insert' }, { error: dbError })
    renderAppAt('/diagnosis')
    await expectSaveFailed('db failure')

    on(verifyAppliance, { data: { id: APPLIANCE_ID } })
    on(verifyDiagnosis, { data: null })
    on({ table: 'diagnoses', op: 'insert' }, { data: { id: 'diagnosis-2' } })
    on({ table: 'repair_sessions', op: 'insert' }, createdRow)
    scriptSavedLoad(storedRow)
    const before = await retry()
    await expectSavedAndReopened()

    expect(saveCalls().slice(before).map(summary)).toEqual([
      'appliances.select:maybeSingle',
      'diagnoses.select:maybeSingle',
      'diagnoses.insert:single',
      'repair_sessions.select:await',
      'repair_sessions.insert:single',
    ])
    expect(callsTo('repair_sessions', 'insert').at(-1)?.payload).toMatchObject({ diagnosis_id: 'diagnosis-2' })
    expect(getSession()?.diagnosisPersistence?.diagnosisId).toBe('diagnosis-2')
  })

  it('a cached appliance id that cannot be verified fails the retry (existing verification path)', async () => {
    seedSession()
    rehydrateFindsNothing()
    on({ table: 'appliances', op: 'select', columns: 'id', where: (c) => c.limit === 2 }, { data: [] })
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    once({ table: 'repair_sessions', op: 'insert' }, { error: dbError })
    renderAppAt('/diagnosis')
    await expectSaveFailed('db failure')

    on(verifyAppliance, { data: null })
    consoleError.mockClear()
    const before = await retry()
    await waitFor(() =>
      expect(consoleError.mock.calls.some((args) => (args[1] as Error)?.message === 'applianceUnverified')).toBe(true)
    )
    expect(await screen.findByText(t('diagnosis.saveStatus.failed'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('common.retry') })).toBeTruthy()
    expect(saveCalls().slice(before).map(summary)).toEqual(['appliances.select:maybeSingle'])
    expect(currentPath()).toBe('/diagnosis')
  })

  it('does not insert a second repair session after a created row failed the link check', async () => {
    seedSession()
    rehydrateFindsNothing()
    once({ table: 'appliances', op: 'select', columns: 'id', where: (c) => c.limit === 2 }, { data: [] })
    once({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    once({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    once({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    once({ table: 'repair_sessions', op: 'insert' }, (call) => {
      const row = createdRow(call).data as Record<string, unknown>
      return { data: { ...row, appliance_id: 'not-mine' } }
    })
    renderAppAt('/diagnosis')
    await expectSaveFailed('sessionLinkMismatch')

    // The database now holds that row for the reused diagnosis id.
    on(verifyAppliance, { data: { id: APPLIANCE_ID } })
    on(verifyDiagnosis, { data: { id: DIAGNOSIS_ID } })
    on(
      { table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status', where: (c) => c.filters.some(([, v]) => v === DIAGNOSIS_ID) },
      { data: [{ id: SESSION_ID, appliance_id: 'not-mine' }] }
    )
    on({ table: 'repair_sessions', op: 'insert' }, createdRow)
    consoleError.mockClear()
    const before = await retry()
    await waitFor(() =>
      expect(
        consoleError.mock.calls.some((args) => (args[1] as Error)?.message === 'sessionApplianceMismatch')
      ).toBe(true)
    )

    expect(saveCalls().slice(before).map(summary)).toEqual([
      'appliances.select:maybeSingle',
      'diagnoses.select:maybeSingle',
      'repair_sessions.select:await',
    ])
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(1)
    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
  })

  it("ignores another repair's ids written into the shared cache before the retry", async () => {
    seedSession()
    // Rehydration no longer overlays a fresh attempt (D10), so the shared cache is
    // contaminated directly here: any other writer of it must not redirect the retry.
    on({ table: 'appliances', op: 'select', columns: 'id', where: (c) => c.limit === 2 }, { data: [] })
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    once({ table: 'repair_sessions', op: 'insert' }, { error: dbError })
    renderAppAt('/diagnosis')
    await expectSaveFailed('db failure')

    saveSession({
      historySessionId: 'old-session',
      diagnosisPersistence: {
        userId: USER.id,
        applianceId: 'old-appliance',
        diagnosisId: 'old-diagnosis',
        repairSessionId: 'old-session',
      },
    })

    on(verifyAppliance, { data: { id: APPLIANCE_ID } })
    on(verifyDiagnosis, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'insert' }, createdRow)
    scriptSavedLoad(storedRow)
    const before = await retry()
    await expectSavedAndReopened()

    const retried = saveCalls().slice(before)
    expect(retried[0].filters).toEqual([['id', APPLIANCE_ID], ['user_id', USER.id]])
    expect(retried[1].filters).toEqual([['id', DIAGNOSIS_ID], ['user_id', USER.id]])
    expect(calls.some((c) => c.filters.some(([, v]) => v === 'old-diagnosis' || v === 'old-session'))).toBe(false)
    expect(callsTo('repair_sessions', 'update')).toHaveLength(0)
    expect(callsTo('repair_sessions', 'insert').at(-1)?.payload).toMatchObject({ diagnosis_id: DIAGNOSIS_ID })
  })
})

// ---- ownership and guests ----

describe('ownership and guest behaviour', () => {
  it('a signed-out guest gets a log-in prompt, no save attempt, no table calls and no retry (D3 fixed)', async () => {
    setUser(null)
    saveSession({
      diagnosis: makeDiagnosis(),
      diagnosisAttemptId: ATTEMPT_ID,
      imageDataUrl: 'data:image/jpeg;base64,AAAA',
      description: 'Guest description',
    })
    renderAppAt('/diagnosis')

    expect(await screen.findByText(t('diagnosis.saveStatus.signInRequired'))).toBeTruthy()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(t('session.notSaved'))
    expect(alert.textContent).toContain(t('diagnosis.saveError.signInRequired'))
    expect(screen.getByRole('link', { name: t('nav.logIn') }).getAttribute('href')).toBe('/login')
    expect(screen.queryByText(t('diagnosis.saveStatus.failed'))).toBeNull()
    expect(screen.queryByRole('button', { name: t('common.retry') })).toBeNull()
    await settle()
    expect(calls).toEqual([])
    // The save is never started, so not even its auth check runs.
    expect(fakeSupabase.auth.getUser).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    // The result itself is still shown to the guest.
    expect(screen.getAllByText('Dripping tap').length).toBeGreaterThan(0)
  })

  it("another user's cached session is not saved and not shown", async () => {
    seedSession({}, { ownerUserId: OTHER_USER_ID })
    rehydrateFindsNothing()
    renderAppAt('/diagnosis')

    expect(await screen.findByText(t('common.error'))).toBeTruthy()
    // Auth has resolved (AuthProvider verified the token), so the save effect has run.
    await waitFor(() => expect(fakeSupabase.auth.getUser).toHaveBeenCalledWith('test-token'))
    // D10: the fresh, unlinked attempt is not overlaid, so not even the rehydrate
    // query runs (it used to be the one repair_sessions call here).
    expect(callsTo('repair_sessions')).toHaveLength(0)
    expect(saveCalls()).toEqual([])
    expect(consoleError.mock.calls.some((args) => args[0] === 'Diagnosis save failed:')).toBe(false)
  })

  it('a saved row owned by another user is reported as not found and never cached', async () => {
    window.history.pushState({}, '', `/diagnosis?session=${SESSION_ID}`)
    on(
      { table: 'repair_sessions', op: 'select', columns: '*' },
      { data: { id: SESSION_ID, user_id: OTHER_USER_ID, diagnosis: makeDiagnosis(), status: 'in_progress' } }
    )
    on({ table: 'chat_messages', op: 'select' }, { count: 0 })
    render(<App />)

    expect(await screen.findByText(t('session.notFoundTitle'))).toBeTruthy()
    expect(getSession()).toBeNull()
    expect(callsTo('repair_sessions')[0].filters).toEqual([['id', SESSION_ID], ['user_id', USER.id]])
  })

  it('a verified saved row replaces another repair cache and drops cached and stored steps', async () => {
    saveSession({
      diagnosis: makeDiagnosis({ issueName: 'Old repair' }),
      ownerUserId: USER.id,
      historySessionId: 'old-session',
      imageDataUrl: 'data:image/jpeg;base64,OLD',
      steps: STEPS,
      currentStep: 3,
    })
    on(
      { table: 'repair_sessions', op: 'select', columns: '*' },
      {
        data: {
          id: SESSION_ID,
          user_id: USER.id,
          diagnosis: makeDiagnosis(),
          description: 'Stored description',
          steps: STEPS,
          current_step: 1,
          status: 'in_progress',
        },
      }
    )
    on({ table: 'chat_messages', op: 'select' }, { count: 0 })
    renderAppAt(`/diagnosis?session=${SESSION_ID}`)

    expect(await screen.findByText(t('session.backToHistory'))).toBeTruthy()
    const cached = getSession()
    expect(cached).toMatchObject({ historySessionId: SESSION_ID, ownerUserId: USER.id, currentStep: 1 })
    expect(cached?.steps).toBeUndefined()
    expect(cached?.imageDataUrl).toBeUndefined()
    expect(screen.queryByText(t('diagnosis.ctaTools'))).toBeNull()
    expect(screen.queryByText(t('history.continue'))).toBeNull()
  })
})

// ---- concurrency and unmount ----

describe('in-flight saves', () => {
  it('unmounting mid-save stops navigation and every later database step; the in-flight row is still recorded (D4 fixed)', async () => {
    seedSession()
    rehydrateFindsNothing()
    on({ table: 'appliances', op: 'select' }, { data: [] })
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    const pending = deferred<FakeResult>()
    on({ table: 'diagnoses', op: 'insert' }, () => pending.promise)
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    on({ table: 'repair_sessions', op: 'insert' }, createdRow)

    const view = renderAppAt('/diagnosis')
    await waitFor(() => expect(callsTo('diagnoses', 'insert')).toHaveLength(1))
    view.unmount()

    pending.resolve({ data: { id: DIAGNOSIS_ID } })
    // The insert that was already in flight is recorded, so a later attempt reuses it.
    await waitFor(() => expect(getSession()?.diagnosisPersistence?.diagnosisId).toBe(DIAGNOSIS_ID))
    await settle()

    expect(callsTo('repair_sessions')).toHaveLength(0)
    expect(getSession()?.diagnosisPersistence).toEqual({
      userId: USER.id,
      applianceId: APPLIANCE_ID,
      diagnosisId: DIAGNOSIS_ID,
    })
    expect(getSession()?.historySessionId).toBeUndefined()
    expect(currentPath()).toBe('/diagnosis')
    expect(linkPhotoMock).not.toHaveBeenCalled()
    // A cancellation is not reported as a failed save.
    expect(consoleError.mock.calls.some((args) => args[0] === 'Diagnosis save failed:')).toBe(false)
  })

  it('two pages saving the same attempt at once share one save', async () => {
    seedSession()
    rehydrateFindsNothing()
    const pending = deferred<FakeResult>()
    on({ table: 'appliances', op: 'select', where: (c) => c.limit === 2 }, () => pending.promise)
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    on({ table: 'repair_sessions', op: 'insert' }, createdRow)
    scriptSavedLoad(storedRow)

    window.history.pushState({}, '', '/diagnosis')
    render(<App />)
    render(<App />)
    // Both pages have mounted and resolved auth before the shared save continues.
    await waitFor(() => expect(screen.getAllByText(t('diagnosis.saveStatus.saving'))).toHaveLength(2))
    await waitFor(() => expect(callsTo('appliances', 'select')).toHaveLength(1))
    pending.resolve({ data: [] })

    await waitFor(() => expect(currentPath()).toBe(`/diagnosis?session=${SESSION_ID}`))
    await waitFor(() => expect(screen.getAllByText(t('session.backToHistory'))).toHaveLength(2))
    expect(callsTo('appliances', 'select')).toHaveLength(1)
    expect(callsTo('appliances', 'insert')).toHaveLength(1)
    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(1)
  })
})

// ---- D10: rehydration and a fresh, unlinked attempt ----

describe('rehydration never overlays a fresh attempt with an unrelated active repair', () => {
  const OLD_SESSION_ID = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d'
  const oldActiveRow = {
    id: OLD_SESSION_ID,
    user_id: USER.id,
    appliance_id: 'old-appliance',
    diagnosis_id: 'old-diagnosis',
    diagnosis: makeDiagnosis({ issueName: 'Old repair', summary: 'An older repair.' }),
    description: 'Older description',
    steps: STEPS,
    current_step: 2,
    image_path: 'user-1/old/photo.jpg',
    status: 'in_progress',
  }
  const usesOldIds = (c: RecordedCall) =>
    c.filters.some(([, v]) => v === OLD_SESSION_ID || v === 'old-diagnosis' || v === 'old-appliance')

  it("a fresh save keeps its own diagnosis and ids while the user's older repair is active", async () => {
    seedSession()
    // The older repair IS the user's latest active row: if rehydration asked, it would get it.
    on({ table: 'repair_sessions', op: 'select', columns: REHYDRATE_COLUMNS }, { data: oldActiveRow })
    const lookup = deferred<FakeResult>()
    on({ table: 'appliances', op: 'select', columns: 'id', where: (c) => c.limit === 2 }, () => lookup.promise)
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    on({ table: 'repair_sessions', op: 'insert' }, createdRow)
    scriptSavedLoad(storedRow)
    renderAppAt('/diagnosis')

    // Mid-save: the fresh attempt is intact and nothing from the older repair is shown.
    await waitFor(() => expect(callsTo('appliances')).toHaveLength(1))
    expect(callsTo('repair_sessions').filter((c) => c.columns === REHYDRATE_COLUMNS)).toHaveLength(0)
    expect(getSession()).toMatchObject({
      diagnosisAttemptId: ATTEMPT_ID,
      imageDataUrl: 'data:image/jpeg;base64,AAAA',
      description: 'The kitchen tap keeps dripping when closed.',
      diagnosisPersistence: { userId: USER.id },
      diagnosis: { issueName: 'Dripping tap' },
    })
    expect(getSession()?.historySessionId).toBeUndefined()
    expect(getSession()?.steps).toBeUndefined()
    expect(screen.getAllByText('Dripping tap').length).toBeGreaterThan(0)
    expect(screen.queryByText('Old repair')).toBeNull()

    lookup.resolve({ data: [] })
    await expectSavedAndReopened()

    expect(calls.some(usesOldIds)).toBe(false)
    expect(callsTo('repair_sessions', 'update')).toHaveLength(0)
    expect(callsTo('repair_sessions', 'insert')[0].payload).toMatchObject({
      diagnosis_id: DIAGNOSIS_ID,
      appliance_id: APPLIANCE_ID,
      diagnosis: makeDiagnosis(),
    })
    expect(getSession()?.diagnosisPersistence).toEqual({
      userId: USER.id,
      applianceId: APPLIANCE_ID,
      diagnosisId: DIAGNOSIS_ID,
      repairSessionId: SESSION_ID,
    })
  })

  it("a retry of a fresh attempt never uses the older active repair's ids", async () => {
    seedSession()
    on({ table: 'repair_sessions', op: 'select', columns: REHYDRATE_COLUMNS }, { data: oldActiveRow })
    on({ table: 'appliances', op: 'select', columns: 'id', where: (c) => c.limit === 2 }, { data: [] })
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    once({ table: 'repair_sessions', op: 'insert' }, { error: dbError })
    renderAppAt('/diagnosis')
    await expectSaveFailed('db failure')
    expect(getSession()?.diagnosisPersistence).toEqual({ userId: USER.id, applianceId: APPLIANCE_ID, diagnosisId: DIAGNOSIS_ID })

    on({ table: 'appliances', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'insert' }, createdRow)
    scriptSavedLoad(storedRow)
    const before = saveCalls().length
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))
    await expectSavedAndReopened()

    expect(saveCalls().slice(before).map(summary)).toEqual([
      'appliances.select:maybeSingle',
      'diagnoses.select:maybeSingle',
      'repair_sessions.select:await',
      'repair_sessions.insert:single',
    ])
    expect(calls.some(usesOldIds)).toBe(false)
    expect(callsTo('repair_sessions').filter((c) => c.columns === REHYDRATE_COLUMNS)).toHaveLength(0)
    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
    expect(callsTo('repair_sessions', 'update')).toHaveLength(0)
  })

  it('a cache linked to its own row still rehydrates that row by id, with its photo path (resume kept)', async () => {
    // The shape seedRepairCache leaves for a resumed repair.
    saveSession({
      diagnosis: makeDiagnosis(),
      description: 'Cached description',
      ownerUserId: USER.id,
      historySessionId: SESSION_ID,
      diagnosisPersistence: { userId: USER.id, repairSessionId: SESSION_ID },
      steps: [],
      currentStep: 0,
    })
    on(
      { table: 'repair_sessions', op: 'select', columns: REHYDRATE_COLUMNS },
      {
        data: {
          id: SESSION_ID,
          user_id: USER.id,
          appliance_id: APPLIANCE_ID,
          diagnosis_id: DIAGNOSIS_ID,
          diagnosis: makeDiagnosis(),
          description: 'Stored description',
          steps: STEPS,
          current_step: 1,
          image_path: 'user-1/session/photo.jpg',
          status: 'in_progress',
        },
      }
    )
    renderAppAt('/diagnosis')

    await waitFor(() => expect(getSession()?.imagePath).toBe('user-1/session/photo.jpg'))
    expect(callsTo('repair_sessions')).toEqual([
      expect.objectContaining({ filters: [['id', SESSION_ID], ['user_id', USER.id]], terminal: 'maybeSingle' }),
    ])
    expect(getSession()).toMatchObject({
      description: 'Stored description',
      currentStep: 1,
      historySessionId: SESSION_ID,
      diagnosisPersistence: {
        userId: USER.id,
        repairSessionId: SESSION_ID,
        applianceId: APPLIANCE_ID,
        diagnosisId: DIAGNOSIS_ID,
      },
    })
    // D8: the row's stored steps are not copied; the cache keeps the empty list
    // seedRepairCache wrote. V05 holds: no guide entry and no step content.
    expect(getSession()?.steps).toEqual([])
    expect(screen.queryByText(t('diagnosis.ctaTools'))).toBeNull()
    for (const step of STEPS) expect(screen.queryByText(step.title)).toBeNull()
  })

  it('an empty cache (new tab) still restores the latest active repair', async () => {
    on({ table: 'repair_sessions', op: 'select', columns: REHYDRATE_COLUMNS }, { data: oldActiveRow })
    renderAppAt('/diagnosis')

    await waitFor(() => expect(getSession()?.historySessionId).toBe(OLD_SESSION_ID))
    expect(getSession()).toMatchObject({
      diagnosis: { issueName: 'Old repair' },
      imagePath: 'user-1/old/photo.jpg',
      currentStep: 2,
      diagnosisPersistence: { repairSessionId: OLD_SESSION_ID, diagnosisId: 'old-diagnosis', applianceId: 'old-appliance' },
    })
    expect(callsTo('repair_sessions')[0]).toMatchObject({
      filters: [['user_id', USER.id], ['status', 'in_progress']],
      order: ['updated_at', { ascending: false }],
      limit: 1,
    })
    expect(saveCalls()).toEqual([])
    expect(screen.queryByText(t('diagnosis.ctaTools'))).toBeNull()
  })
})

// ---- D2: the diagnoses row stores the safe diagnosis ----

describe('diagnoses.diagnosis_result gets the same safe diagnosis as the repair session', () => {
  const BLOB = 'A'.repeat(600)

  it('removes photo fields, data URIs and long base64 runs, and keeps the fields its readers use', async () => {
    const diagnosis = {
      ...makeDiagnosis({
        summary: `The washer is worn. data:image/jpeg;base64,${BLOB} See photo.`,
        recommendedFix: `Replace the washer. ${BLOB}`,
        guideSteps: [...STEPS, { id: 'bad' } as unknown as RepairStep],
      }),
      imageDataUrl: `data:image/png;base64,${BLOB}`,
      rawProviderPayload: { image: BLOB },
    }
    seedSession({}, { diagnosis })
    scriptHappyPath()
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    const insert = callsTo('diagnoses', 'insert')[0].payload as Record<string, unknown>
    const stored = insert.diagnosis_result as Record<string, unknown>
    const text = JSON.stringify(stored)
    expect(text).not.toContain('data:image')
    expect(text).not.toContain(BLOB.slice(0, 200))
    expect(stored).not.toHaveProperty('imageDataUrl')
    expect(stored).not.toHaveProperty('rawProviderPayload')
    // What DiagnosisHistory and completedRepair read is still there.
    expect(stored).toMatchObject({
      issueName: 'Dripping tap',
      severity: 'low',
      confidence: 85,
      summary: expect.stringContaining('The washer is worn.'),
      recommendedFix: expect.stringContaining('Replace the washer.'),
    })
    // The guideSteps field is kept as data, re-validated by parseGuideSteps (the malformed
    // entry is dropped; fewer than 3 valid steps would mean no guideSteps at all).
    expect(stored.guideSteps).toEqual(STEPS)
    // Identical to the repair_sessions copy; the other diagnoses columns are unchanged.
    expect(stored).toEqual((callsTo('repair_sessions', 'insert')[0].payload as Record<string, unknown>).diagnosis)
    expect(insert).toMatchObject({ user_id: USER.id, appliance_type: 'Dripping tap', issue_title: 'Dripping tap' })
  })

  it('a photo-bearing diagnosis is never written raw, while the save flow and caps are unchanged', async () => {
    const diagnosis = { ...makeDiagnosis(), imageDataUrl: `data:image/png;base64,${BLOB}` }
    seedSession({}, { diagnosis, description: 'd'.repeat(700), mediaPaths: ['user-1/attempt-1/photo.jpg'] })
    scriptHappyPath()
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(saveCalls().map(summary)).toEqual([
      'appliances.select:await',
      'appliances.insert:single',
      'diagnoses.insert:single',
      'repair_sessions.select:await',
      'repair_sessions.insert:single',
    ])
    const diagnosisResult = (callsTo('diagnoses', 'insert')[0].payload as Record<string, unknown>).diagnosis_result
    expect(diagnosisResult).toEqual(makeDiagnosis())
    expect(callsTo('repair_sessions', 'insert')[0].payload).toMatchObject({
      description: 'd'.repeat(500),
      image_path: 'user-1/attempt-1/photo.jpg',
      steps: [],
      current_step: 0,
    })
  })
})

// ---- D8: rehydration and stored steps ----

describe('rehydration never copies stored steps into the cache', () => {
  const rowWithSteps = {
    id: SESSION_ID,
    user_id: USER.id,
    appliance_id: APPLIANCE_ID,
    diagnosis_id: DIAGNOSIS_ID,
    diagnosis: makeDiagnosis({ guideSteps: STEPS }),
    description: 'Stored description',
    steps: STEPS,
    current_step: 1,
    status: 'in_progress',
  }

  it('a new-tab restore keeps the ids and current step but not the stored steps', async () => {
    on({ table: 'repair_sessions', op: 'select', columns: REHYDRATE_COLUMNS }, { data: rowWithSteps })
    renderAppAt('/diagnosis')

    await waitFor(() => expect(getSession()?.historySessionId).toBe(SESSION_ID))
    expect(getSession()?.steps).toBeUndefined()
    expect(getSession()).toMatchObject({
      currentStep: 1,
      description: 'Stored description',
      diagnosisPersistence: { repairSessionId: SESSION_ID, diagnosisId: DIAGNOSIS_ID, applianceId: APPLIANCE_ID },
    })
  })

  it('the guide stays unavailable and shows no stored step after rehydrating a row with steps', async () => {
    saveSession({
      diagnosis: makeDiagnosis({ guideSteps: STEPS }),
      ownerUserId: USER.id,
      historySessionId: SESSION_ID,
      diagnosisPersistence: { userId: USER.id, repairSessionId: SESSION_ID },
      steps: [],
      currentStep: 0,
    })
    on({ table: 'repair_sessions', op: 'select', columns: REHYDRATE_COLUMNS }, { data: rowWithSteps })
    renderAppAt('/guide')

    expect(await screen.findByRole('heading', { name: t('guide.unavailableTitle') })).toBeTruthy()
    await waitFor(() => expect(getSession()?.currentStep).toBe(1))
    expect(getSession()?.steps).toEqual([])
    for (const step of STEPS) expect(screen.queryByText(step.title)).toBeNull()
    expect(screen.queryByText(t('guide.aiGeneratedNotice'))).toBeNull()
    expect(screen.queryByText(t('guide.fallbackNotice'))).toBeNull()
    // Nothing was written back: no progress commit, no step write.
    expect(callsTo('repair_sessions', 'update')).toHaveLength(0)
  })
})

// ---- D6: the backfill must actually change the row ----

describe('the existing-session backfill only counts as saved when it changed the row', () => {
  const backfillMatch = { table: 'repair_sessions', op: 'update', returning: 'id', terminal: 'maybeSingle' } as const
  // D7: the thrown message is the stable code; the screen shows its translated copy.
  const BACKFILL_FAILED = 'sessionNotUpdated'

  function scriptExistingSession() {
    rehydrateFindsNothing()
    scriptLookups({ sessions: [{ id: SESSION_ID, appliance_id: APPLIANCE_ID }] })
  }

  it('one changed row keeps the success path: cache ids, navigation and photo link', async () => {
    seedSession()
    scriptExistingSession()
    on(backfillMatch, { data: { id: SESSION_ID } })
    scriptSavedLoad(storedRow)
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(callsTo('repair_sessions', 'update')).toEqual([
      expect.objectContaining({
        filters: [['id', SESSION_ID], ['user_id', USER.id], ['status', 'in_progress']],
        returning: 'id',
        terminal: 'maybeSingle',
      }),
    ])
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(0)
    expect(getSession()?.diagnosisPersistence?.repairSessionId).toBe(SESSION_ID)
    expect(linkPhotoMock).toHaveBeenCalledWith(ATTEMPT_ID, SESSION_ID, USER.id)
  })

  it('zero changed rows shows the existing failed-save state with a retry, and caches no row id', async () => {
    seedSession()
    scriptExistingSession()
    on(backfillMatch, { data: null })
    renderAppAt('/diagnosis')
    await expectSaveFailed(BACKFILL_FAILED)

    expect(screen.getByRole('button', { name: t('common.retry') })).toBeTruthy()
    expect(screen.queryByText(t('diagnosis.saveStatus.saved'))).toBeNull()
    expect(getSession()?.diagnosisPersistence).toEqual({
      userId: USER.id,
      applianceId: APPLIANCE_ID,
      diagnosisId: DIAGNOSIS_ID,
    })
    expect(getSession()?.historySessionId).toBeUndefined()
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(0)
    expect(linkPhotoMock).not.toHaveBeenCalled()
  })

  it('an RLS-hidden row (no error, no row returned) is not reported as saved; a later retry can succeed', async () => {
    // PostgREST answers an update that RLS filters out with 200 and no rows, which
    // maybeSingle() turns into { data: null, error: null }. The lookup still saw the row.
    seedSession()
    scriptExistingSession()
    once(backfillMatch, { data: null, error: null })
    renderAppAt('/diagnosis')
    await expectSaveFailed(BACKFILL_FAILED)
    expect(currentPath()).toBe('/diagnosis')

    // Retry (D1 path: the ids are verified and reused); this time the update applies.
    on({ table: 'appliances', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: DIAGNOSIS_ID } })
    on(backfillMatch, { data: { id: SESSION_ID } })
    scriptSavedLoad(storedRow)
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))
    await expectSavedAndReopened()

    expect(callsTo('repair_sessions', 'update')).toHaveLength(2)
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(0)
    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
  })

  it('the completed-row guard stays: status filter kept, status never written, no new session inserted', async () => {
    // A completed row matches the lookup (it has no status filter) but not the update.
    seedSession()
    scriptExistingSession()
    on(backfillMatch, (call) => ({
      data: call.filters.some(([column, value]) => column === 'status' && value === 'in_progress') ? null : { id: SESSION_ID },
    }))
    renderAppAt('/diagnosis')
    await expectSaveFailed(BACKFILL_FAILED)

    const [backfill] = callsTo('repair_sessions', 'update')
    expect(backfill.filters).toContainEqual(['status', 'in_progress'])
    expect(backfill.payload).not.toHaveProperty('status')
    expect(backfill.payload).not.toHaveProperty('completed_at')
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(0)
  })

  it('a returned row with a different id is not accepted', async () => {
    seedSession()
    scriptExistingSession()
    on(backfillMatch, { data: { id: 'some-other-row' } })
    renderAppAt('/diagnosis')
    await expectSaveFailed(BACKFILL_FAILED)
    expect(getSession()?.diagnosisPersistence?.repairSessionId).toBeUndefined()
  })
})

// ---- D4: leaving the page stops the save safely ----

describe('a save nobody waits for any more stops at its next database step', () => {
  it('unmounting during the appliance lookup creates no appliance, diagnosis or session', async () => {
    seedSession()
    rehydrateFindsNothing()
    const lookup = deferred<FakeResult>()
    on({ table: 'appliances', op: 'select', columns: 'id', where: (c) => c.limit === 2 }, () => lookup.promise)
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })

    const view = renderAppAt('/diagnosis')
    await waitFor(() => expect(callsTo('appliances')).toHaveLength(1))
    view.unmount()
    lookup.resolve({ data: [] })
    await settle()

    expect(saveCalls().map(summary)).toEqual(['appliances.select:await'])
    expect(getSession()?.diagnosisPersistence).toEqual({ userId: USER.id })
    expect(linkPhotoMock).not.toHaveBeenCalled()
  })

  it('unmounting while the session insert is in flight still records the row and links the photo', async () => {
    seedSession()
    rehydrateFindsNothing()
    scriptLookups()
    const insert = deferred<FakeResult>()
    on({ table: 'repair_sessions', op: 'insert' }, (call) => insert.promise.then(() => createdRow(call)))

    const view = renderAppAt('/diagnosis')
    await waitFor(() => expect(callsTo('repair_sessions', 'insert')).toHaveLength(1))
    view.unmount()
    insert.resolve({})
    await waitFor(() => expect(getSession()?.diagnosisPersistence?.repairSessionId).toBe(SESSION_ID))
    await settle()

    // The row exists, so its bookkeeping is finished; only the page reaction is skipped.
    expect(getSession()).toMatchObject({ historySessionId: SESSION_ID, steps: [], currentStep: 0 })
    expect(linkPhotoMock).toHaveBeenCalledWith(ATTEMPT_ID, SESSION_ID, USER.id)
    expect(currentPath()).toBe('/diagnosis')
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(1)
  })

  it('reopening the page after a cancelled save reuses the recorded ids (no duplicate diagnosis)', async () => {
    seedSession()
    rehydrateFindsNothing()
    once({ table: 'appliances', op: 'select', columns: 'id', where: (c) => c.limit === 2 }, { data: [] })
    once({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    const pending = deferred<FakeResult>()
    once({ table: 'diagnoses', op: 'insert' }, () => pending.promise)

    const first = renderAppAt('/diagnosis')
    await waitFor(() => expect(callsTo('diagnoses', 'insert')).toHaveLength(1))
    first.unmount()
    pending.resolve({ data: { id: DIAGNOSIS_ID } })
    await waitFor(() => expect(getSession()?.diagnosisPersistence?.diagnosisId).toBe(DIAGNOSIS_ID))
    await settle()

    on({ table: 'appliances', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    on({ table: 'repair_sessions', op: 'insert' }, createdRow)
    scriptSavedLoad(storedRow)
    const before = saveCalls().length
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(saveCalls().slice(before).map(summary)).toEqual([
      'appliances.select:maybeSingle',
      'diagnoses.select:maybeSingle',
      'repair_sessions.select:await',
      'repair_sessions.insert:single',
    ])
    expect(callsTo('appliances', 'insert')).toHaveLength(1)
    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
  })

  it('one of two pages leaving does not cancel the save the other is still waiting for', async () => {
    seedSession()
    rehydrateFindsNothing()
    const lookup = deferred<FakeResult>()
    on({ table: 'appliances', op: 'select', where: (c) => c.limit === 2 }, () => lookup.promise)
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    on({ table: 'repair_sessions', op: 'insert' }, createdRow)
    scriptSavedLoad(storedRow)

    window.history.pushState({}, '', '/diagnosis')
    const leaving = render(<App />)
    render(<App />)
    await waitFor(() => expect(screen.getAllByText(t('diagnosis.saveStatus.saving'))).toHaveLength(2))
    await waitFor(() => expect(callsTo('appliances')).toHaveLength(1))
    leaving.unmount()
    lookup.resolve({ data: [] })

    await expectSavedAndReopened()
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(1)
    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
  })

  // In the signed-in flow StrictMode's mount-time double effect runs while auth is still
  // loading (before the save is joined), so this is a regression guard for the dev render,
  // not a test of the waiter count; the two-page test above covers that.
  it('a save under StrictMode completes normally', async () => {
    seedSession()
    scriptHappyPath()
    window.history.pushState({}, '', '/diagnosis')
    render(
      <StrictMode>
        <App />
      </StrictMode>
    )
    await expectSavedAndReopened()

    expect(saveCalls().map(summary)).toEqual([
      'appliances.select:await',
      'appliances.insert:single',
      'diagnoses.insert:single',
      'repair_sessions.select:await',
      'repair_sessions.insert:single',
    ])
    expect(consoleError.mock.calls.some((args) => args[0] === 'Diagnosis save failed:')).toBe(false)
  })
})

// ---- D3 / D7: guest prompt and localized save-failure reasons ----

describe('save failures are shown as translated reasons', () => {
  afterEach(() => {
    setLocale('en')
  })

  it('a guest sees the log-in prompt in Hindi, with no error logged', async () => {
    setLocale('hi')
    setUser(null)
    saveSession({
      diagnosis: makeDiagnosis(),
      diagnosisAttemptId: ATTEMPT_ID,
      imageDataUrl: 'data:image/jpeg;base64,AAAA',
      description: 'Guest description',
    })
    renderAppAt('/diagnosis')

    expect(await screen.findByText(t('diagnosis.saveStatus.signInRequired', 'hi'))).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(t('diagnosis.saveError.signInRequired', 'hi'))
    expect(screen.getByRole('link', { name: t('nav.logIn', 'hi') })).toBeTruthy()
    await settle()
    expect(calls).toEqual([])
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('an expired session found by the save shows the log-in prompt and a retry, without logging an error', async () => {
    const original = fakeSupabase.auth.getUser.getMockImplementation()
    // AuthProvider's token check still succeeds; the save's own server check finds no user.
    fakeSupabase.auth.getUser.mockImplementation(async (accessToken?: string) =>
      accessToken === undefined
        ? { data: { user: null }, error: null }
        : { data: { user: USER }, error: null }
    )
    try {
      seedSession()
      rehydrateFindsNothing()
      renderAppAt('/diagnosis')

      expect(await screen.findByText(t('diagnosis.saveStatus.signInRequired'))).toBeTruthy()
      expect(screen.getByRole('alert').textContent).toContain(t('diagnosis.saveError.signInRequired'))
      expect(screen.getByRole('link', { name: t('nav.logIn') })).toBeTruthy()
      expect(screen.getByRole('button', { name: t('common.retry') })).toBeTruthy()
      expect(consoleError.mock.calls.some((args) => args[0] === 'Diagnosis save failed:')).toBe(false)
      expect(saveCalls()).toEqual([])
    } finally {
      if (original) fakeSupabase.auth.getUser.mockImplementation(original)
    }
  })

  it('a known failure is shown in the current language and follows a language change', async () => {
    seedSession()
    rehydrateFindsNothing()
    on({ table: 'appliances', op: 'select' }, { data: [{ id: 'a' }, { id: 'b' }] })
    renderAppAt('/diagnosis')
    await expectSaveFailed('duplicateAppliances')
    expect(screen.getByRole('alert').textContent).toContain(t('diagnosis.saveError.duplicateAppliances', 'en'))

    act(() => setLocale('hi'))
    expect(await screen.findByText(t('diagnosis.saveError.duplicateAppliances', 'hi'))).toBeTruthy()
    expect(screen.getByText(t('diagnosis.saveStatus.failed', 'hi'))).toBeTruthy()
  })

  it('an unknown failure keeps the safe fallback and never shows the raw error text', async () => {
    setLocale('hi')
    seedSession()
    rehydrateFindsNothing()
    on({ table: 'appliances', op: 'select' }, { error: { message: 'permission denied for table appliances', code: '42501' } })
    renderAppAt('/diagnosis')

    expect(await screen.findByText(t('diagnosis.saveStatus.failed', 'hi'))).toBeTruthy()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(t('diagnosis.saveError.unknown', 'hi'))
    expect(alert.textContent).not.toContain('permission denied')
    // Real failures are still logged for diagnosis.
    expect(consoleError.mock.calls.some((args) => args[0] === 'Diagnosis save failed:')).toBe(true)
  })

  it('a retry clears the previous reason while it runs', async () => {
    seedSession()
    rehydrateFindsNothing()
    once({ table: 'appliances', op: 'select' }, { error: dbError })
    renderAppAt('/diagnosis')
    await expectSaveFailed('db failure')

    const lookup = deferred<FakeResult>()
    on({ table: 'appliances', op: 'select' }, () => lookup.promise)
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))
    expect(await screen.findByText(t('diagnosis.saveStatus.saving'))).toBeTruthy()
    expect(screen.queryByText(t('diagnosis.saveError.unknown'))).toBeNull()
    lookup.resolve({ error: dbError })
    expect(await screen.findByText(t('diagnosis.saveError.unknown'))).toBeTruthy()
  })
})

describe('removing the unreachable issue-name check does not change saving', () => {
  it('an issue name with surrounding spaces saves exactly as before (trimmed label, stored title as given)', async () => {
    seedSession({ issueName: '  Dripping tap  ' })
    scriptHappyPath()
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(callsTo('appliances')[0].filters).toEqual([
      ['user_id', USER.id],
      ['name', 'Dripping tap'],
      ['appliance_type', 'Dripping tap'],
    ])
    expect(callsTo('appliances', 'insert')[0].payload).toEqual({ user_id: USER.id, name: 'Dripping tap', appliance_type: 'Dripping tap' })
    expect(callsTo('diagnoses', 'insert')[0].payload).toMatchObject({ appliance_type: 'Dripping tap', issue_title: '  Dripping tap  ' })
    expect(callsTo('repair_sessions', 'insert')[0].payload).toMatchObject({ title: 'Dripping tap', issue_name: 'Dripping tap' })
  })

  it('a blank issue name never reaches the save: the page rejects it first', async () => {
    seedSession({ issueName: '   ' })
    rehydrateFindsNothing()
    renderAppAt('/diagnosis')

    expect(await screen.findByText(t('common.error'))).toBeTruthy()
    await waitFor(() => expect(fakeSupabase.auth.getUser).toHaveBeenCalledWith('test-token'))
    await settle()
    expect(saveCalls()).toEqual([])
    expect(consoleError.mock.calls.some((args) => args[0] === 'Diagnosis save failed:')).toBe(false)
  })
})

// ---- D11: a viewed saved session is not replaced by another active repair ----

describe('after viewing a saved session, rehydration keeps that session', () => {
  const OTHER_ACTIVE_ID = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d'
  const byId = (id: string) => (c: RecordedCall) => c.filters.some(([col, v]) => col === 'id' && v === id)
  const isActiveFallback = (c: RecordedCall) => c.filters.some(([col]) => col === 'status')

  function seedViewedSessionCache() {
    // What writeVerifiedSessionToCache leaves after /diagnosis?session=<id>.
    saveSession({
      diagnosis: makeDiagnosis({ issueName: 'Viewed repair' }),
      description: 'Viewed description',
      ownerUserId: USER.id,
      historySessionId: SESSION_ID,
      currentStep: 0,
    })
  }

  function scriptRows() {
    on(
      { table: 'repair_sessions', op: 'select', columns: REHYDRATE_COLUMNS, where: byId(SESSION_ID) },
      {
        data: {
          id: SESSION_ID,
          user_id: USER.id,
          diagnosis: makeDiagnosis({ issueName: 'Viewed repair' }),
          description: 'Viewed description',
          current_step: 1,
          status: 'completed',
        },
      }
    )
    on(
      { table: 'repair_sessions', op: 'select', columns: REHYDRATE_COLUMNS, where: isActiveFallback },
      {
        data: {
          id: OTHER_ACTIVE_ID,
          user_id: USER.id,
          diagnosis: makeDiagnosis({ issueName: 'Other active repair' }),
          description: 'Other description',
          current_step: 3,
          status: 'in_progress',
        },
      }
    )
  }

  for (const path of ['/tools', '/guide']) {
    it(`${path} without ?session reloads the viewed session by its id, not the latest active repair`, async () => {
      seedViewedSessionCache()
      scriptRows()
      renderAppAt(path)

      await waitFor(() => expect(getSession()?.diagnosisPersistence?.repairSessionId).toBe(SESSION_ID))
      expect(callsTo('repair_sessions')).toEqual([
        expect.objectContaining({ filters: [['id', SESSION_ID], ['user_id', USER.id]], terminal: 'maybeSingle' }),
      ])
      expect(calls.some(isActiveFallback)).toBe(false)
      // currentStep is clamped to the row's step count (none here), as before.
      expect(getSession()).toMatchObject({
        historySessionId: SESSION_ID,
        currentStep: 0,
        diagnosis: { issueName: 'Viewed repair' },
      })
      expect(screen.queryByText('Other active repair')).toBeNull()
      // V05 unchanged: no guide for live data.
      expect(await screen.findByRole('heading', { name: t('guide.unavailableTitle') })).toBeTruthy()
    })
  }

  it('if the viewed row is gone, the cached view is kept rather than replaced by another repair', async () => {
    seedViewedSessionCache()
    on({ table: 'repair_sessions', op: 'select', columns: REHYDRATE_COLUMNS, where: byId(SESSION_ID) }, { data: null })
    renderAppAt('/tools')

    await waitFor(() => expect(callsTo('repair_sessions')).toHaveLength(1))
    await settle()
    expect(calls.some(isActiveFallback)).toBe(false)
    expect(getSession()).toMatchObject({ historySessionId: SESSION_ID, diagnosis: { issueName: 'Viewed repair' } })
  })
})

// ---- D14: a finished repair for this diagnosis is a state, not a dead end ----

describe('a diagnosis whose repair is already finished', () => {
  function scriptCompletedMatch(applianceId = APPLIANCE_ID) {
    seedSession({}, { diagnosisPersistence: { userId: USER.id, applianceId: APPLIANCE_ID, diagnosisId: DIAGNOSIS_ID } })
    on({ table: 'appliances', op: 'select', terminal: 'maybeSingle' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'select', terminal: 'maybeSingle' }, { data: { id: DIAGNOSIS_ID } })
    on(
      { table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' },
      { data: [{ id: SESSION_ID, appliance_id: applianceId, status: 'completed' }] }
    )
  }

  it('shows the finished state with a way forward, writes nothing and offers no retry', async () => {
    scriptCompletedMatch()
    rehydrateFindsNothing()
    renderAppAt('/diagnosis')

    expect(await screen.findByText(t('diagnosis.saveStatus.alreadyCompleted'))).toBeTruthy()
    expect(screen.getByText(t('diagnosis.saveError.sessionCompleted'))).toBeTruthy()
    expect(screen.getByRole('link', { name: t('diagnosis.viewFinishedRepair') }).getAttribute('href')).toBe(
      `/diagnosis?session=${SESSION_ID}`
    )
    expect(screen.getByRole('link', { name: t('session.scanAgain') }).getAttribute('href')).toBe('/capture')
    expect(screen.queryByRole('button', { name: t('common.retry') })).toBeNull()
    expect(screen.queryByText(t('session.notSaved'))).toBeNull()
    expect(screen.queryByText(t('diagnosis.saveStatus.failed'))).toBeNull()

    // The finished row is never written to and is not linked to this attempt.
    expect(callsTo('repair_sessions', 'update')).toHaveLength(0)
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(0)
    expect(getSession()?.diagnosisPersistence?.repairSessionId).toBeUndefined()
    expect(getSession()?.historySessionId).toBeUndefined()
    expect(currentPath()).toBe('/diagnosis')
    expect(consoleError.mock.calls.some((args) => args[0] === 'Diagnosis save failed:')).toBe(false)
    expect(linkPhotoMock).not.toHaveBeenCalled()
  })

  it('"View the finished repair" opens it from the database (owner-scoped)', async () => {
    scriptCompletedMatch()
    rehydrateFindsNothing()
    on(
      { table: 'repair_sessions', op: 'select', columns: '*' },
      { data: { id: SESSION_ID, user_id: USER.id, diagnosis: makeDiagnosis(), status: 'completed' } }
    )
    on({ table: 'chat_messages', op: 'select' }, { count: 0 })
    renderAppAt('/diagnosis')

    fireEvent.click(await screen.findByRole('link', { name: t('diagnosis.viewFinishedRepair') }))
    expect(await screen.findByText(t('session.backToHistory'))).toBeTruthy()
    expect(currentPath()).toBe(`/diagnosis?session=${SESSION_ID}`)
    expect(calls.find((c) => c.columns === '*')?.filters).toEqual([['id', SESSION_ID], ['user_id', USER.id]])
    expect(callsTo('repair_sessions', 'update')).toHaveLength(0)
  })

  it('the appliance link checks still come first', async () => {
    scriptCompletedMatch('another-appliance')
    rehydrateFindsNothing()
    renderAppAt('/diagnosis')
    await expectSaveFailed('sessionApplianceMismatch')
    expect(screen.queryByText(t('diagnosis.saveStatus.alreadyCompleted'))).toBeNull()
  })
})

// ---- D16: a guest's result survives logging in and is saved on request ----

describe('a result made as a guest, after logging in', () => {
  function seedGuestResult() {
    saveSession({
      diagnosis: makeDiagnosis(),
      diagnosisAttemptId: ATTEMPT_ID,
      imageDataUrl: 'data:image/jpeg;base64,AAAA',
      description: 'Guest description',
    })
  }

  it('is shown with a "save to my account" choice and nothing is saved until it is chosen', async () => {
    seedGuestResult()
    scriptHappyPath()
    renderAppAt('/diagnosis')

    expect(await screen.findByText(t('diagnosis.claim.body'))).toBeTruthy()
    expect(screen.getAllByText('Dripping tap').length).toBeGreaterThan(0)
    expect(screen.queryByText(t('common.error'))).toBeNull()
    await settle()
    expect(saveCalls()).toEqual([])
    expect(getSession()?.ownerUserId).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: t('diagnosis.claim.action') }))
    await expectSavedAndReopened()
    expect(saveCalls().map(summary)).toEqual([
      'appliances.select:await',
      'appliances.insert:single',
      'diagnoses.insert:single',
      'repair_sessions.select:await',
      'repair_sessions.insert:single',
    ])
    expect(callsTo('repair_sessions', 'insert')[0].payload).toMatchObject({
      user_id: USER.id,
      description: 'Guest description',
    })
    expect(getSession()).toMatchObject({ ownerUserId: USER.id, diagnosisPersistence: { repairSessionId: SESSION_ID } })
  })

  it('the guest "Log in" link returns to the result after logging in', async () => {
    setUser(null)
    seedGuestResult()
    renderAppAt('/diagnosis')
    fireEvent.click(await screen.findByRole('link', { name: t('nav.logIn') }))
    await waitFor(() => expect(currentPath()).toBe('/login'))

    // Logging in (Supabase reports SIGNED_IN to the AuthProvider listener).
    setUser(USER)
    type AuthListener = (event: string, session: { user: typeof USER } | null) => void
    const recorded = fakeSupabase.auth.onAuthStateChange.mock.calls as unknown as Array<[AuthListener]>
    const listener = recorded[0]?.[0]
    expect(listener).toBeTruthy()
    act(() => listener?.('SIGNED_IN', { user: USER }))

    await waitFor(() => expect(currentPath()).toBe('/diagnosis'))
    expect(await screen.findByRole('button', { name: t('diagnosis.claim.action') })).toBeTruthy()
    // The guest result is still there, unowned until the user chooses to save it.
    expect(getSession()).toMatchObject({ diagnosisAttemptId: ATTEMPT_ID, description: 'Guest description' })
    expect(getSession()?.ownerUserId).toBeUndefined()
    expect(saveCalls()).toEqual([])
  })

  it("a result owned by another user is never offered for claiming", async () => {
    seedSession({}, { ownerUserId: OTHER_USER_ID })
    rehydrateFindsNothing()
    renderAppAt('/diagnosis')
    expect(await screen.findByText(t('common.error'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('diagnosis.claim.action') })).toBeNull()
  })
})

describe('claimGuestSession', () => {
  it('claims only an ownerless, valid result for the same attempt', () => {
    saveSession({
      diagnosis: makeDiagnosis(),
      diagnosisAttemptId: ATTEMPT_ID,
      imageDataUrl: 'data:image/jpeg;base64,AAAA',
    })
    expect(claimGuestSession('another-attempt', USER.id)).toBe(false)
    expect(getSession()?.ownerUserId).toBeUndefined()
    expect(claimGuestSession(ATTEMPT_ID, USER.id)).toBe(true)
    expect(getSession()?.ownerUserId).toBe(USER.id)
    // Already owned: never reassigned.
    expect(claimGuestSession(ATTEMPT_ID, OTHER_USER_ID)).toBe(false)
    expect(getSession()?.ownerUserId).toBe(USER.id)
  })
})

// ---- D12 / D13: capped names and text in the save ----

describe('the save stores capped names and text, but matches appliances on the full name', () => {
  const longName = `Leaking ${'pipe '.repeat(30)}`.trim()

  it('an existing appliance with a long name is still matched (lookup key not capped) and reused', async () => {
    seedSession({ issueName: longName })
    scriptHappyPath({ appliances: [{ id: 'appliance-long' }] })
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    expect(callsTo('appliances')[0].filters).toEqual([
      ['user_id', USER.id],
      ['name', longName],
      ['appliance_type', longName],
    ])
    expect(callsTo('appliances', 'insert')).toHaveLength(0)
    expect(callsTo('repair_sessions', 'insert')[0].payload).toMatchObject({ appliance_id: 'appliance-long' })
    const diagnosisRow = callsTo('diagnoses', 'insert')[0].payload as Record<string, string>
    expect(Array.from(diagnosisRow.issue_title)).toHaveLength(80)
    expect(Array.from(diagnosisRow.appliance_type)).toHaveLength(80)
  })

  it('long prose is capped identically in both stored rows; the safety warning is kept whole', async () => {
    const warning = `Turn off the water first. ${'Keep the area dry. '.repeat(100)}`
    seedSession({
      summary: 'The washer is worn. '.repeat(100),
      recommendedFix: 'Replace the washer. '.repeat(100),
      safetyWarning: warning,
    })
    scriptHappyPath()
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    const sessionDiagnosis = (callsTo('repair_sessions', 'insert')[0].payload as { diagnosis: Record<string, string> }).diagnosis
    const diagnosisResult = (callsTo('diagnoses', 'insert')[0].payload as { diagnosis_result: unknown }).diagnosis_result
    expect(Array.from(sessionDiagnosis.summary)).toHaveLength(1000)
    expect(sessionDiagnosis.summary.endsWith('…')).toBe(true)
    expect(Array.from(sessionDiagnosis.recommendedFix)).toHaveLength(1000)
    expect(sessionDiagnosis.safetyWarning).toBe(warning)
    expect(diagnosisResult).toEqual(sessionDiagnosis)
  })

  it('a hazard beyond the cap is stored whole, so the reopened result is still blocked', async () => {
    const summary = `${'The tap drips slowly. '.repeat(60)}I smell gas near the boiler.`
    seedSession({ summary })
    scriptHappyPath()
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()

    const stored = (callsTo('repair_sessions', 'insert')[0].payload as { diagnosis: { summary: string } }).diagnosis
    expect(stored.summary).toBe(summary)
    // The saved view (rebuilt from the stored row) still shows the blocked result.
    expect(screen.queryByText(t('diagnosis.ctaTools'))).toBeNull()
    expect(screen.queryByText(t('diagnosis.riskSafe'))).toBeNull()
  })
})

// ---- D17 (prepared): a unique-index conflict on the session insert ----

describe('a duplicate-key conflict (23505) on the session insert', () => {
  // What PostgREST returns once repair_sessions has the proposed unique index.
  const uniqueViolation = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "repair_sessions_user_diagnosis_key"',
    details: `Key (user_id, diagnosis_id)=(${USER.id}, ${DIAGNOSIS_ID}) already exists.`,
    hint: null,
  }

  function scriptConflictOnFirstInsert() {
    seedSession()
    rehydrateFindsNothing()
    once({ table: 'appliances', op: 'select', columns: 'id', where: (c) => c.limit === 2 }, { data: [] })
    once({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    once({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    // The lookup ran before the other row committed, so it saw nothing...
    once({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    // ...and the insert then lost the race.
    once({ table: 'repair_sessions', op: 'insert' }, { error: uniqueViolation })
  }

  it('shows a clear translated failure with a retry, never the raw database text', async () => {
    scriptConflictOnFirstInsert()
    renderAppAt('/diagnosis')
    await expectSaveFailed('sessionAlreadyExists')

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(t('diagnosis.saveError.sessionAlreadyExists'))
    expect(alert.textContent).not.toContain('duplicate key')
    expect(screen.getByRole('button', { name: t('common.retry') })).toBeTruthy()
    // Nothing was created by this insert, so no row id is cached; the ids made so far are.
    expect(getSession()?.diagnosisPersistence).toEqual({ userId: USER.id, applianceId: APPLIANCE_ID, diagnosisId: DIAGNOSIS_ID })
    expect(linkPhotoMock).not.toHaveBeenCalled()
  })

  it('a retry reuses the row that won the race instead of inserting another', async () => {
    scriptConflictOnFirstInsert()
    renderAppAt('/diagnosis')
    await expectSaveFailed('sessionAlreadyExists')

    on({ table: 'appliances', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: DIAGNOSIS_ID } })
    on(
      { table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' },
      { data: [{ id: SESSION_ID, appliance_id: APPLIANCE_ID, status: 'in_progress' }] }
    )
    on({ table: 'repair_sessions', op: 'update', returning: 'id' }, { data: { id: SESSION_ID } })
    scriptSavedLoad(storedRow)
    const before = saveCalls().length
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))
    await expectSavedAndReopened()

    expect(saveCalls().slice(before).map(summary)).toEqual([
      'appliances.select:maybeSingle',
      'diagnoses.select:maybeSingle',
      'repair_sessions.select:await',
      'repair_sessions.update:maybeSingle',
    ])
    // One insert attempt in total (the one that conflicted); no second diagnosis either.
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(1)
    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
    expect(getSession()?.diagnosisPersistence?.repairSessionId).toBe(SESSION_ID)
  })

  it('if the winning row is already finished, the retry shows the finished state (D14), not a loop', async () => {
    scriptConflictOnFirstInsert()
    renderAppAt('/diagnosis')
    await expectSaveFailed('sessionAlreadyExists')

    on({ table: 'appliances', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: DIAGNOSIS_ID } })
    on(
      { table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' },
      { data: [{ id: SESSION_ID, appliance_id: APPLIANCE_ID, status: 'completed' }] }
    )
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))

    expect(await screen.findByText(t('diagnosis.saveStatus.alreadyCompleted'))).toBeTruthy()
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(1)
    expect(callsTo('repair_sessions', 'update')).toHaveLength(0)
  })

  it('other insert errors keep the generic fallback (only 23505 is mapped)', async () => {
    seedSession()
    rehydrateFindsNothing()
    scriptLookups()
    on({ table: 'repair_sessions', op: 'insert' }, { error: { code: '23503', message: 'foreign key violation' } })
    renderAppAt('/diagnosis')
    await expectSaveFailed('foreign key violation')
    expect(screen.getByRole('alert').textContent).toContain(t('diagnosis.saveError.unknown'))
  })
})

// ---- D19 (option C): a claimed guest result is saved honestly, without its photo ----

describe('claiming a result made before logging in never uploads its photo', () => {
  afterEach(() => {
    setLocale('en')
  })

  function seedGuestResult() {
    saveSession({
      diagnosis: makeDiagnosis(),
      diagnosisAttemptId: ATTEMPT_ID,
      imageDataUrl: 'data:image/jpeg;base64,AAAA',
      description: 'Guest description',
    })
  }

  it('the claim panel says the earlier photo is not saved (English)', async () => {
    seedGuestResult()
    rehydrateFindsNothing()
    renderAppAt('/diagnosis')

    const button = await screen.findByRole('button', { name: t('diagnosis.claim.action') })
    const panel = button.parentElement as HTMLElement
    expect(panel.textContent).toContain(t('diagnosis.claim.photoNotSaved', 'en'))
  })

  it('the claim panel says the earlier photo is not saved (Hindi)', async () => {
    setLocale('hi')
    seedGuestResult()
    rehydrateFindsNothing()
    renderAppAt('/diagnosis')

    const button = await screen.findByRole('button', { name: t('diagnosis.claim.action', 'hi') })
    expect((button.parentElement as HTMLElement).textContent).toContain(t('diagnosis.claim.photoNotSaved', 'hi'))
  })

  it('claiming saves the diagnosis without image_path and makes no storage call', async () => {
    seedGuestResult()
    scriptHappyPath()
    renderAppAt('/diagnosis')
    fireEvent.click(await screen.findByRole('button', { name: t('diagnosis.claim.action') }))
    await expectSavedAndReopened()

    expect(callsTo('repair_sessions', 'insert')[0].payload).not.toHaveProperty('image_path')
    // No late photo-path update either (nothing was uploaded).
    expect(callsTo('repair_sessions', 'update')).toHaveLength(0)
    // The strict fake records any storage use as unexpected; there is none.
    expect(unexpected.filter((call) => call.startsWith('storage'))).toEqual([])
    expect(unexpected).toEqual([])
    expect(getSession()?.mediaPaths).toBeUndefined()
    expect(getSession()?.imagePath).toBeUndefined()
  })

  it('the saved view of the claimed result shows the existing photo-missing notice', async () => {
    seedGuestResult()
    scriptHappyPath()
    renderAppAt('/diagnosis')
    fireEvent.click(await screen.findByRole('button', { name: t('diagnosis.claim.action') }))
    await expectSavedAndReopened()

    expect(screen.getByText(t('session.photoMissing'))).toBeTruthy()
  })

  it('the notice appears only in the claim panel (not for a guest, not for a normal signed-in save)', async () => {
    seedSession()
    scriptHappyPath()
    renderAppAt('/diagnosis')
    await expectSavedAndReopened()
    expect(screen.queryByText(t('diagnosis.claim.photoNotSaved'))).toBeNull()
  })

  it('a signed-out guest sees the log-in prompt but not the claim photo notice', async () => {
    setUser(null)
    seedGuestResult()
    renderAppAt('/diagnosis')
    expect(await screen.findByText(t('diagnosis.saveStatus.signInRequired'))).toBeTruthy()
    expect(screen.queryByText(t('diagnosis.claim.photoNotSaved'))).toBeNull()
  })
})

// ---- D20: a guest result lives in this tab only; the prompt says so ----

describe('the guest log-in prompt explains that the result stays in this tab', () => {
  afterEach(() => {
    setLocale('en')
  })

  function seedGuestResult() {
    saveSession({
      diagnosis: makeDiagnosis(),
      diagnosisAttemptId: ATTEMPT_ID,
      imageDataUrl: 'data:image/jpeg;base64,AAAA',
      description: 'Guest description',
    })
  }

  it('shows the same-tab guidance in English, with no save or storage use', async () => {
    setUser(null)
    seedGuestResult()
    renderAppAt('/diagnosis')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(t('diagnosis.claim.sameTab', 'en'))
    await settle()
    expect(calls).toEqual([])
    // Nothing was copied to longer-lived storage.
    expect(localStorage.getItem('repairSession')).toBeNull()
    expect(Object.keys(localStorage).some((key) => (localStorage.getItem(key) ?? '').includes('data:image'))).toBe(false)
  })

  it('shows the same-tab guidance in Hindi', async () => {
    setLocale('hi')
    setUser(null)
    seedGuestResult()
    renderAppAt('/diagnosis')
    expect((await screen.findByRole('alert')).textContent).toContain(t('diagnosis.claim.sameTab', 'hi'))
  })

  it('is not shown for a signed-in failure or on the claim panel', async () => {
    seedSession()
    rehydrateFindsNothing()
    on({ table: 'appliances', op: 'select' }, { error: dbError })
    renderAppAt('/diagnosis')
    await expectSaveFailed('db failure')
    expect(screen.queryByText(t('diagnosis.claim.sameTab'))).toBeNull()
  })
})

// ---- D21: a restore never records an empty user id ----

describe('rehydration records the saving user only when it is known', () => {
  const restoredRow = {
    id: SESSION_ID,
    user_id: USER.id,
    appliance_id: APPLIANCE_ID,
    diagnosis_id: DIAGNOSIS_ID,
    diagnosis: makeDiagnosis(),
    description: 'Stored description',
    current_step: 0,
    status: 'in_progress',
  }

  it('a history-only cache gets the ids without a made-up empty userId; resume fields unchanged', async () => {
    saveSession({ diagnosis: makeDiagnosis(), ownerUserId: USER.id, historySessionId: SESSION_ID })
    on({ table: 'repair_sessions', op: 'select', columns: REHYDRATE_COLUMNS }, { data: restoredRow })
    renderAppAt('/tools')

    await waitFor(() => expect(getSession()?.diagnosisPersistence?.repairSessionId).toBe(SESSION_ID))
    const persistence = getSession()?.diagnosisPersistence
    expect(persistence).toEqual({ repairSessionId: SESSION_ID, diagnosisId: DIAGNOSIS_ID, applianceId: APPLIANCE_ID })
    expect(persistence).not.toHaveProperty('userId')
    expect(getSession()).toMatchObject({ historySessionId: SESSION_ID, description: 'Stored description', ownerUserId: USER.id })
  })

  it('a cache that already knows its user keeps it', async () => {
    saveSession({
      diagnosis: makeDiagnosis(),
      ownerUserId: USER.id,
      historySessionId: SESSION_ID,
      diagnosisPersistence: { userId: USER.id, repairSessionId: SESSION_ID },
    })
    on({ table: 'repair_sessions', op: 'select', columns: REHYDRATE_COLUMNS }, { data: restoredRow })
    renderAppAt('/tools')

    await waitFor(() => expect(getSession()?.diagnosisPersistence?.diagnosisId).toBe(DIAGNOSIS_ID))
    expect(getSession()?.diagnosisPersistence).toEqual({
      userId: USER.id,
      repairSessionId: SESSION_ID,
      diagnosisId: DIAGNOSIS_ID,
      applianceId: APPLIANCE_ID,
    })
  })
})
