import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { t } from '../src/i18n'
import { getSession } from '../src/services/repairSession'
import {
  callsTo,
  deferred,
  on,
  once,
  resetFake,
  setUser,
  unexpected,
  type FakeResult,
  type RecordedCall,
} from './helpers/persistenceFake'
import { currentPath, renderAppAt } from './helpers/renderApp'
import { seedSession } from './helpers/fixtures'

vi.mock('../src/lib/supabase', async () => ({ supabase: (await import('./helpers/persistenceFake')).supabase }))
vi.mock('../src/lib/test-supabase', () => ({ testSupabaseConnection: vi.fn(async () => true) }))
// A short wait limit so a hung save can be exercised quickly (production: 30 s).
vi.mock('../src/config/limits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/config/limits')>()),
  DIAGNOSIS_SAVE_TIMEOUT_MS: 150,
}))

// D9: a save that never settles no longer blocks the page. The wait is bounded; a save
// stuck on a READ is abandoned so a retry can start fresh, while one stuck on a WRITE is
// kept (no database uniqueness would stop a duplicate row) and a retry rejoins it.

const USER = { id: 'user-1', email: 'tester@example.test' }
const SESSION_ID = '3f2b8a4e-1c5d-4e6f-8a9b-0c1d2e3f4a5b'
const APPLIANCE_ID = 'appliance-1'
const DIAGNOSIS_ID = 'diagnosis-1'
const nameLookup = { table: 'appliances', op: 'select', columns: 'id', where: (c: RecordedCall) => c.limit === 2 } as const
let attemptNumber = 0

function seedTimeoutSession() {
  seedSession({}, { diagnosisAttemptId: `timeout-test-attempt-${++attemptNumber}` })
}

let consoleError: MockInstance<(...args: unknown[]) => void>
let consoleWarn: MockInstance<(...args: unknown[]) => void>

beforeEach(() => {
  resetFake()
  setUser(USER)
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  expect(unexpected).toEqual([])
  consoleError.mockRestore()
  consoleWarn.mockRestore()
})

function createdRow(call: RecordedCall): FakeResult {
  const p = call.payload as Record<string, unknown>
  return { data: { id: SESSION_ID, user_id: p.user_id, diagnosis_id: p.diagnosis_id, appliance_id: p.appliance_id } }
}

function scriptRestOfSave() {
  on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
  on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
  on({ table: 'repair_sessions', op: 'insert' }, createdRow)
  // After navigation the saved row is loaded (SavedDiagnosis).
  on({ table: 'repair_sessions', op: 'select', columns: '*' }, () => ({
    data: { ...(callsTo('repair_sessions', 'insert')[0]?.payload as object), id: SESSION_ID, user_id: USER.id },
  }))
  on({ table: 'chat_messages', op: 'select' }, { count: 0 })
}

async function expectTimedOut() {
  expect(await screen.findByText(t('diagnosis.saveError.timedOut'))).toBeTruthy()
  expect(screen.getByText(t('diagnosis.saveStatus.failed'))).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain(t('session.notSaved'))
  expect(currentPath()).toBe('/diagnosis')
}

async function expectSaved() {
  await waitFor(() => expect(currentPath()).toBe(`/diagnosis?session=${SESSION_ID}`))
  expect(await screen.findByText(t('session.backToHistory'))).toBeTruthy()
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

describe('a hung diagnosis save no longer blocks retries', () => {
  it('stuck on a read: times out with a retry, and the retry starts a fresh save', async () => {
    seedTimeoutSession()
    const hung = deferred<FakeResult>()
    once(nameLookup, () => hung.promise)
    on(nameLookup, { data: [] })
    on({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    scriptRestOfSave()
    renderAppAt('/diagnosis')

    await expectTimedOut()
    expect(callsTo('appliances', 'insert')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))
    await expectSaved()
    expect(callsTo('appliances').filter((c) => c.limit === 2)).toHaveLength(2)

    // The abandoned save's late answer starts nothing and does not touch the cache.
    const cachedBefore = JSON.stringify(getSession()?.diagnosisPersistence)
    hung.resolve({ data: [{ id: 'stale-appliance' }] })
    await settle()
    expect(JSON.stringify(getSession()?.diagnosisPersistence)).toBe(cachedBefore)
    expect(callsTo('appliances', 'insert')).toHaveLength(1)
    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(1)
  })

  it('stuck on a write: the retry rejoins it instead of inserting again, and gets its result', async () => {
    seedTimeoutSession()
    on(nameLookup, { data: [] })
    const hungInsert = deferred<FakeResult>()
    once({ table: 'diagnoses', op: 'insert' }, () => hungInsert.promise)
    scriptRestOfSave()
    renderAppAt('/diagnosis')

    await expectTimedOut()
    const before = callsTo('appliances').length
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))
    expect(await screen.findByText(t('diagnosis.saveStatus.saving'))).toBeTruthy()
    // Rejoined: no new lookup, no second diagnosis insert.
    expect(callsTo('appliances')).toHaveLength(before)
    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)

    hungInsert.resolve({ data: { id: DIAGNOSIS_ID } })
    await expectSaved()
    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(1)
    expect(getSession()?.diagnosisPersistence).toEqual({
      userId: USER.id,
      applianceId: APPLIANCE_ID,
      diagnosisId: DIAGNOSIS_ID,
      repairSessionId: SESSION_ID,
    })
  })

  it('a write that never settles times out again on retry and is never duplicated', async () => {
    seedTimeoutSession()
    on(nameLookup, { data: [] })
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    const hungInsert = deferred<FakeResult>()
    once({ table: 'diagnoses', op: 'insert' }, () => hungInsert.promise)
    renderAppAt('/diagnosis')

    await expectTimedOut()
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))
    expect(await screen.findByText(t('diagnosis.saveStatus.saving'))).toBeTruthy()
    await expectTimedOut()

    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
    expect(callsTo('appliances', 'insert')).toHaveLength(1)
    expect(callsTo('repair_sessions')).toHaveLength(0)

    // End the hung request so nothing is left running.
    hungInsert.resolve({ error: { message: 'connection reset' } })
    await settle()
    expect(callsTo('repair_sessions')).toHaveLength(0)
  })

  it('a timed-out save is logged as a failure and shows the translated reason', async () => {
    seedTimeoutSession()
    once(nameLookup, () => deferred<FakeResult>().promise)
    renderAppAt('/diagnosis')

    await expectTimedOut()
    const logged = consoleError.mock.calls.find((args) => args[0] === 'Diagnosis save failed:')
    expect((logged?.[1] as Error | undefined)?.message).toBe('timedOut')
    expect(screen.getByRole('button', { name: t('common.retry') })).toBeTruthy()
  })
})

describe('D17 (prepared) with a hung write (D9/D18)', () => {
  it('a hung session insert that finally fails with 23505 is reported, and the next retry reuses the existing row', async () => {
    seedTimeoutSession()
    on(nameLookup, { data: [] })
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    once({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    const hungInsert = deferred<FakeResult>()
    once({ table: 'repair_sessions', op: 'insert' }, () => hungInsert.promise)
    renderAppAt('/diagnosis')

    // D9: the write is kept; the page offers a retry that rejoins it (no second insert).
    await expectTimedOut()
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))
    expect(await screen.findByText(t('diagnosis.saveStatus.saving'))).toBeTruthy()
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(1)

    // The request finally answers: another save had committed the row first.
    hungInsert.resolve({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
    expect(await screen.findByText(t('diagnosis.saveError.sessionAlreadyExists'))).toBeTruthy()

    // Next retry: a fresh save verifies the recorded ids and finds the row.
    on({ table: 'appliances', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'select', columns: 'id', terminal: 'maybeSingle' }, { data: { id: DIAGNOSIS_ID } })
    on(
      { table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' },
      { data: [{ id: SESSION_ID, appliance_id: APPLIANCE_ID, status: 'in_progress' }] }
    )
    on({ table: 'repair_sessions', op: 'update', returning: 'id' }, { data: { id: SESSION_ID } })
    on({ table: 'repair_sessions', op: 'select', columns: '*' }, () => ({
      data: { id: SESSION_ID, user_id: USER.id, ...(callsTo('repair_sessions', 'update')[0]?.payload as object) },
    }))
    on({ table: 'chat_messages', op: 'select' }, { count: 0 })
    fireEvent.click(screen.getByRole('button', { name: t('common.retry') }))
    await expectSaved()

    expect(callsTo('repair_sessions', 'insert')).toHaveLength(1)
    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
    expect(callsTo('appliances', 'insert')).toHaveLength(1)
  })
})

describe('D18: after a timeout, the page shows how the kept save really ended', () => {
  it('a timed-out write that later succeeds turns the page into saved, without a retry or a second insert', async () => {
    seedTimeoutSession()
    on(nameLookup, { data: [] })
    const hungInsert = deferred<FakeResult>()
    once({ table: 'diagnoses', op: 'insert' }, () => hungInsert.promise)
    scriptRestOfSave()
    renderAppAt('/diagnosis')

    await expectTimedOut()
    hungInsert.resolve({ data: { id: DIAGNOSIS_ID } })

    await expectSaved()
    expect(screen.queryByRole('button', { name: t('common.retry') })).toBeNull()
    expect(screen.queryByText(t('diagnosis.saveError.timedOut'))).toBeNull()
    expect(callsTo('diagnoses', 'insert')).toHaveLength(1)
    expect(callsTo('repair_sessions', 'insert')).toHaveLength(1)
  })

  it('a timed-out write that later fails shows the real reason instead of "taking too long"', async () => {
    seedTimeoutSession()
    on(nameLookup, { data: [] })
    on({ table: 'appliances', op: 'insert' }, { data: { id: APPLIANCE_ID } })
    on({ table: 'diagnoses', op: 'insert' }, { data: { id: DIAGNOSIS_ID } })
    on({ table: 'repair_sessions', op: 'select', columns: 'id, appliance_id, status' }, { data: [] })
    const hungInsert = deferred<FakeResult>()
    once({ table: 'repair_sessions', op: 'insert' }, () => hungInsert.promise)
    renderAppAt('/diagnosis')

    await expectTimedOut()
    hungInsert.resolve({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } })

    expect(await screen.findByText(t('diagnosis.saveError.sessionAlreadyExists'))).toBeTruthy()
    expect(screen.queryByText(t('diagnosis.saveError.timedOut'))).toBeNull()
    expect(screen.getByRole('button', { name: t('common.retry') })).toBeTruthy()
    expect(currentPath()).toBe('/diagnosis')
  })

  it('after leaving the page, a late success changes nothing on screen and starts nothing new (D4)', async () => {
    seedTimeoutSession()
    on(nameLookup, { data: [] })
    const hungInsert = deferred<FakeResult>()
    once({ table: 'diagnoses', op: 'insert' }, () => hungInsert.promise)
    scriptRestOfSave()
    const view = renderAppAt('/diagnosis')

    await expectTimedOut()
    view.unmount()
    hungInsert.resolve({ data: { id: DIAGNOSIS_ID } })
    await settle()

    // The in-flight id is recorded (D4), but no further database step runs and no navigation.
    expect(getSession()?.diagnosisPersistence?.diagnosisId).toBe(DIAGNOSIS_ID)
    expect(callsTo('repair_sessions')).toHaveLength(0)
    expect(currentPath()).toBe('/diagnosis')
  })
})
