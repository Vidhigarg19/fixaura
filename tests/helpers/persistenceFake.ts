import { vi } from 'vitest'

// A strict, scripted stand-in for src/lib/supabase.ts, used by the Diagnosis
// persistence characterization tests.
//
// - Models ONLY the query-chain pieces the Diagnosis save, rehydrate and saved-session
//   load actually use: from(table).select/insert/update, eq, order, limit, single,
//   maybeSingle and awaiting the builder directly; auth.getUser/getSession/onAuthStateChange.
// - Records every call: table, operation, columns, payload, filters, modifiers, terminal.
// - Each response is scripted by the test (`on`). A call without a matching script, or a
//   chain method that is not modelled, is recorded in `unexpected` and rejected.
// - Never touches the network. Storage and edge functions are not modelled: any use is
//   recorded as unexpected.
//
// The existing permissive mock (tests/helpers/supabaseMock.ts) is left unchanged.

export interface FakeUser {
  id: string
  email: string
}

export type TableOp = 'select' | 'insert' | 'update'
export type Terminal = 'single' | 'maybeSingle' | 'await'

export interface RecordedCall {
  table: string
  op: TableOp
  /** Columns passed to the FIRST select (for op === 'select'). */
  columns?: string
  selectOptions?: unknown
  /** Payload of insert/update. */
  payload?: unknown
  /** Columns of a select() chained after insert/update (the returned row shape). */
  returning?: string
  filters: Array<[string, unknown]>
  order?: [string, unknown]
  limit?: number
  terminal: Terminal
}

export interface FakeResult {
  data?: unknown
  error?: unknown
  count?: number | null
}

export type Responder = FakeResult | ((call: RecordedCall) => FakeResult | Promise<FakeResult>)

export interface CallMatcher {
  table: string
  op: TableOp
  columns?: string
  returning?: string
  terminal?: Terminal
  /** Extra predicate, e.g. on a filter value. */
  where?: (call: RecordedCall) => boolean
}

interface Handler {
  match: CallMatcher
  respond: Responder
  remaining: number
}

const state: {
  user: FakeUser | null
  getUserError: unknown
  handlers: Handler[]
} = { user: null, getUserError: null, handlers: [] }

/** Every completed table call, in the order its terminal (single/maybeSingle/await) ran. */
export const calls: RecordedCall[] = []
/** Every call that was not scripted or used an unmodelled method. Tests assert it stays empty. */
export const unexpected: string[] = []

export function setUser(user: FakeUser | null) {
  state.user = user
}

/** Makes every auth.getUser() WITHOUT an access token return this error (the save and DB reads). */
export function setGetUserError(error: unknown) {
  state.getUserError = error
}

/** Scripts the response for matching calls. `times` defaults to unlimited. */
export function on(match: CallMatcher, respond: Responder, times = Number.POSITIVE_INFINITY) {
  state.handlers.push({ match, respond, remaining: times })
}

export function once(match: CallMatcher, respond: Responder) {
  on(match, respond, 1)
}

export function callsTo(table: string, op?: TableOp) {
  return calls.filter((call) => call.table === table && (!op || call.op === op))
}

export function resetFake() {
  state.user = null
  state.getUserError = null
  state.handlers = []
  calls.length = 0
  unexpected.length = 0
  supabase.auth.getUser.mockClear()
  supabase.auth.getSession.mockClear()
  supabase.auth.onAuthStateChange.mockClear()
  supabase.from.mockClear()
}

function describeCall(call: RecordedCall) {
  return `${call.table}.${call.op}(${call.columns ?? ''})${call.returning !== undefined ? `.select(${call.returning})` : ''} ${JSON.stringify(call.filters)} -> ${call.terminal}`
}

function matches(match: CallMatcher, call: RecordedCall) {
  return (
    match.table === call.table &&
    match.op === call.op &&
    (match.columns === undefined || match.columns === call.columns) &&
    (match.returning === undefined || match.returning === call.returning) &&
    (match.terminal === undefined || match.terminal === call.terminal) &&
    (!match.where || match.where(call))
  )
}

function reject(message: string): Promise<never> {
  unexpected.push(message)
  return Promise.reject(new Error(`Unexpected Supabase call: ${message}`))
}

async function settle(call: RecordedCall): Promise<FakeResult> {
  calls.push(call)
  const handler = state.handlers.find((h) => h.remaining > 0 && matches(h.match, call))
  if (!handler) return reject(describeCall(call))
  handler.remaining -= 1
  const result = typeof handler.respond === 'function' ? await handler.respond(call) : handler.respond
  return { data: null, error: null, ...result }
}

function tableBuilder(table: string) {
  const draft: Omit<RecordedCall, 'terminal' | 'op'> & { op?: TableOp } = { table, filters: [] }
  let finished = false

  const finish = (terminal: Terminal): Promise<FakeResult> => {
    if (finished) return reject(`${table}: chain settled twice`)
    finished = true
    if (!draft.op) return reject(`${table}: no operation before ${terminal}`)
    return settle({ ...draft, op: draft.op, terminal })
  }

  const setOp = (op: TableOp) => {
    if (draft.op) {
      unexpected.push(`${table}: ${op} after ${draft.op}`)
      throw new Error(`Unexpected Supabase chain: ${table}.${draft.op}().${op}()`)
    }
    draft.op = op
  }

  const methods: Record<string, (...args: never[]) => unknown> = {
    select(columns?: string, options?: unknown) {
      if (draft.op === 'insert' || draft.op === 'update') {
        draft.returning = columns ?? '*'
      } else {
        setOp('select')
        draft.columns = columns
        if (options !== undefined) draft.selectOptions = options
      }
      return proxy
    },
    insert(payload: unknown) {
      setOp('insert')
      draft.payload = payload
      return proxy
    },
    update(payload: unknown) {
      setOp('update')
      draft.payload = payload
      return proxy
    },
    eq(column: string, value: unknown) {
      draft.filters.push([column, value])
      return proxy
    },
    order(column: string, options: unknown) {
      draft.order = [column, options]
      return proxy
    },
    limit(count: number) {
      draft.limit = count
      return proxy
    },
    single: () => finish('single'),
    maybeSingle: () => finish('maybeSingle'),
    then(resolve: (value: FakeResult) => unknown, rejectFn: (reason: unknown) => unknown) {
      return finish('await').then(resolve, rejectFn)
    },
  }

  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property === 'symbol') return undefined
        if (property in methods) return methods[property]
        unexpected.push(`${table}.${property}()`)
        throw new Error(`Unexpected Supabase chain method: ${table}.${property}()`)
      },
    }
  )
  return proxy
}

function unmodelled(name: string) {
  return () => {
    unexpected.push(name)
    throw new Error(`Unexpected Supabase call: ${name}`)
  }
}

export const supabase = {
  auth: {
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
    getSession: vi.fn(async () => ({
      data: { session: state.user ? { access_token: 'test-token', user: state.user } : null },
      error: null,
    })),
    // AuthProvider passes the access token; the save and DB reads call it with no argument.
    getUser: vi.fn(async (accessToken?: string) => {
      if (accessToken === undefined && state.getUserError) {
        return { data: { user: null }, error: state.getUserError }
      }
      return { data: { user: state.user }, error: null }
    }),
    signOut: unmodelled('auth.signOut'),
  },
  from: vi.fn((table: string) => tableBuilder(table)),
  storage: { from: unmodelled('storage.from') },
  functions: { invoke: unmodelled('functions.invoke') },
}

/** A promise the test resolves by hand, for in-flight and stale-response cases. */
export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
