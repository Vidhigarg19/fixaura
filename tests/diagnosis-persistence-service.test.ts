import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  DiagnosisSaveCancelledError,
  saveDiagnosisAndSession,
  type DiagnosisSaveDeps,
} from '../src/services/diagnosisPersistence'
import type { RepairSession } from '../src/types/repair'
import { on, resetFake, setUser, unexpected, type RecordedCall, type Responder } from './helpers/persistenceFake'
import { makeDiagnosis } from './helpers/fixtures'

vi.mock('../src/lib/supabase', async () => ({ supabase: (await import('./helpers/persistenceFake')).supabase }))

// Direct tests of the service boundary only. The full behaviour (queries, payloads,
// failures, retry, unmount) is characterized through the page in
// diagnosis-persistence.test.tsx. What the page cannot observe is WHEN each cache write
// happens relative to the queries; that ordering is what a retry relies on.

const USER = { id: 'user-1', email: 'tester@example.test' }
const SESSION_ID = '3f2b8a4e-1c5d-4e6f-8a9b-0c1d2e3f4a5b'

type Event = string
let events: Event[]
let cache: Partial<RepairSession>
let consoleError: MockInstance<(...args: unknown[]) => void>

function logged(respond: Responder): Responder {
  return async (call: RecordedCall) => {
    events.push(`db:${call.table}.${call.op}`)
    return typeof respond === 'function' ? respond(call) : respond
  }
}

function deps(): DiagnosisSaveDeps {
  return {
    readCache: () => {
      events.push('cache:read')
      return cache
    },
    writeCache: (partial) => {
      events.push(`cache:write ${Object.keys(partial).join(',')}`)
      cache = { ...cache, ...partial }
    },
  }
}

const input = {
  attemptId: 'attempt-1',
  diagnosis: makeDiagnosis(),
  description: 'The kitchen tap keeps dripping when closed.',
  diagnosisPersistence: undefined,
}

beforeEach(() => {
  resetFake()
  setUser(USER)
  events = []
  cache = {}
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  expect(unexpected).toEqual([])
  consoleError.mockRestore()
})

describe('saveDiagnosisAndSession', () => {
  it('writes each id to the cache right after the row that produced it', async () => {
    on({ table: 'appliances', op: 'select' }, logged({ data: [] }))
    on({ table: 'appliances', op: 'insert' }, logged({ data: { id: 'appliance-1' } }))
    on({ table: 'diagnoses', op: 'insert' }, logged({ data: { id: 'diagnosis-1' } }))
    on({ table: 'repair_sessions', op: 'select' }, logged({ data: [] }))
    on(
      { table: 'repair_sessions', op: 'insert' },
      logged((call) => {
        const p = call.payload as Record<string, unknown>
        return { data: { id: SESSION_ID, user_id: p.user_id, diagnosis_id: p.diagnosis_id, appliance_id: p.appliance_id } }
      })
    )

    await expect(saveDiagnosisAndSession(input, deps())).resolves.toBeUndefined()

    expect(events).toEqual([
      'cache:write diagnosisAttemptId,diagnosisPersistence',
      'db:appliances.select',
      'db:appliances.insert',
      'cache:write diagnosisAttemptId,diagnosisPersistence',
      'db:diagnoses.insert',
      'cache:write diagnosisAttemptId,diagnosisPersistence',
      'db:repair_sessions.select',
      'cache:read',
      'db:repair_sessions.insert',
      'cache:write diagnosisAttemptId,diagnosisPersistence,historySessionId,steps,currentStep',
      'cache:read',
    ])
    expect(cache).toEqual({
      diagnosisAttemptId: 'attempt-1',
      diagnosisPersistence: {
        userId: USER.id,
        applianceId: 'appliance-1',
        diagnosisId: 'diagnosis-1',
        repairSessionId: SESSION_ID,
      },
      historySessionId: SESSION_ID,
      steps: [],
      currentStep: 0,
    })
  })

  it('rejects with the stage error and leaves presentation to the caller', async () => {
    on({ table: 'appliances', op: 'select' }, logged({ data: [] }))
    on({ table: 'appliances', op: 'insert' }, logged({ data: { id: 'appliance-1' } }))
    on({ table: 'diagnoses', op: 'insert' }, logged({ error: { message: 'db failure' } }))

    await expect(saveDiagnosisAndSession(input, deps())).rejects.toEqual({ message: 'db failure' })

    // The ids created before the failure are already cached; nothing after it ran.
    expect(cache.diagnosisPersistence).toEqual({ userId: USER.id, applianceId: 'appliance-1' })
    expect(events.at(-1)).toBe('db:diagnoses.insert')
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('stops before the next database step once cancelled, keeping the ids already written', async () => {
    let cancelled = false
    on({ table: 'appliances', op: 'select' }, logged({ data: [] }))
    on(
      { table: 'appliances', op: 'insert' },
      logged(() => {
        // The page is left while the appliance insert is in flight.
        cancelled = true
        return { data: { id: 'appliance-1' } }
      })
    )

    await expect(
      saveDiagnosisAndSession(input, { ...deps(), isCancelled: () => cancelled })
    ).rejects.toBeInstanceOf(DiagnosisSaveCancelledError)

    expect(events).toEqual([
      'cache:write diagnosisAttemptId,diagnosisPersistence',
      'db:appliances.select',
      'db:appliances.insert',
      'cache:write diagnosisAttemptId,diagnosisPersistence',
    ])
    expect(cache.diagnosisPersistence).toEqual({ userId: USER.id, applianceId: 'appliance-1' })
  })
})
