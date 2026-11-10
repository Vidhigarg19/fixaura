import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { persistImagePath, persistObservation, persistSymptomAnswers } from '../src/services/repairSessionDb'
import type { ObservationResult } from '../src/types/repair'
import { callsTo, on, resetFake, setUser, unexpected, type FakeResult } from './helpers/persistenceFake'

vi.mock('../src/lib/supabase', async () => ({ supabase: (await import('./helpers/persistenceFake')).supabase }))

// D15: the three single-column repair_sessions updates only count when they changed THIS
// row (the D6 pattern: .select('id').maybeSingle(), null = no row changed).

const USER = { id: 'user-1', email: 'tester@example.test' }
const SESSION_ID = '3f2b8a4e-1c5d-4e6f-8a9b-0c1d2e3f4a5b'

const observation: ObservationResult = {
  status: 'no_clear_change',
  summary: 'No clear difference is visible.',
  limitations: [],
  warnings: [],
  nextAdvice: 'Check again later.',
  safetyOverride: false,
  policyVersion: 'test',
  observedAt: '2026-11-06T10:00:00.000Z',
}

const CASES = [
  {
    name: 'persistImagePath',
    run: () => persistImagePath(SESSION_ID, 'user-1/session/photo.jpg'),
    payload: { image_path: 'user-1/session/photo.jpg' },
    label: 'the photo reference',
  },
  {
    name: 'persistSymptomAnswers',
    run: () => persistSymptomAnswers(SESSION_ID, { leak: 'constant' }),
    payload: { symptom_answers: { leak: 'constant' } },
    label: 'follow-up answers',
  },
  {
    name: 'persistObservation',
    run: () => persistObservation(SESSION_ID, observation),
    payload: { observation },
    label: 'the observation',
  },
] as const

beforeEach(() => {
  resetFake()
  setUser(USER)
})

afterEach(() => {
  expect(unexpected).toEqual([])
})

function respond(result: FakeResult) {
  on({ table: 'repair_sessions', op: 'update' }, result)
}

describe.each(CASES)('$name verifies that the row changed', ({ run, payload, label }) => {
  it('resolves when exactly this row was changed, with the owner filter and the returned id', async () => {
    respond({ data: { id: SESSION_ID } })
    await run()

    expect(callsTo('repair_sessions')).toEqual([
      expect.objectContaining({
        op: 'update',
        payload,
        filters: [['id', SESSION_ID], ['user_id', USER.id]],
        returning: 'id',
        terminal: 'maybeSingle',
      }),
    ])
  })

  it('rejects when no row changed (missing, or hidden by RLS)', async () => {
    respond({ data: null, error: null })
    await expect(run()).rejects.toThrow(
      `Unable to save ${label}: the repair was not changed (not found or not available).`
    )
  })

  it('rejects when a different row comes back', async () => {
    respond({ data: { id: 'some-other-row' } })
    await expect(run()).rejects.toThrow(`Unable to save ${label}: the repair was not changed`)
  })

  it('still reports a database error as before', async () => {
    respond({ error: { message: 'permission denied' } })
    await expect(run()).rejects.toThrow(`Unable to save ${label}: permission denied`)
  })

  it('still does nothing when nobody is signed in', async () => {
    setUser(null)
    await run()
    expect(callsTo('repair_sessions')).toEqual([])
  })
})

it('persistObservation still returns the stored observation on success', async () => {
  respond({ data: { id: SESSION_ID } })
  await expect(persistObservation(SESSION_ID, observation)).resolves.toEqual(observation)
})
