import { vi } from 'vitest'

// A stand-in for src/lib/supabase.ts. Nothing here talks to the network:
// every table call resolves with an empty result and every call is recorded.

export interface FakeUser {
  id: string
  email: string
}

export const TEST_USER: FakeUser = { id: 'user-1', email: 'tester@example.test' }

const state: { user: FakeUser | null } = { user: null }

export function setSignedInUser(user: FakeUser | null) {
  state.user = user
}

export const functionsInvoke = vi.fn(async () => ({
  data: null as unknown,
  error: { message: 'Edge functions are blocked in tests' } as unknown,
}))
export const fromCalls: string[] = []
export const storageCalls: string[] = []

const LIST_RESULT = { data: [] as unknown[], error: null, count: 0 }
const SINGLE_RESULT = { data: null, error: null }

function tableBuilder(): unknown {
  const builder: unknown = new Proxy(function () {}, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(LIST_RESULT).then(resolve, reject)
      }
      if (property === 'single' || property === 'maybeSingle') {
        return () => Promise.resolve(SINGLE_RESULT)
      }
      return () => builder
    },
  })
  return builder
}

const storageBucket = {
  upload: vi.fn(async () => {
    storageCalls.push('upload')
    return { data: null, error: { message: 'Storage is blocked in tests' } }
  }),
  createSignedUrl: vi.fn(async () => ({ data: null, error: { message: 'blocked' } })),
  remove: vi.fn(async () => ({ data: null, error: null })),
}

export const supabase = {
  auth: {
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
    getSession: vi.fn(async () => ({
      data: {
        session: state.user ? { access_token: 'test-token', user: state.user } : null,
      },
      error: null,
    })),
    getUser: vi.fn(async () => ({ data: { user: state.user }, error: null })),
    signOut: vi.fn(async () => {
      state.user = null
      return { error: null }
    }),
    signUp: vi.fn(async () => ({ data: { session: null, user: null }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { session: null, user: null }, error: null })),
    signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
    signInWithOtp: vi.fn(async () => ({ data: {}, error: null })),
  },
  from: vi.fn((table: string) => {
    fromCalls.push(table)
    return tableBuilder()
  }),
  storage: {
    from: vi.fn(() => storageBucket),
  },
  functions: { invoke: functionsInvoke },
}

export function resetSupabaseMock() {
  state.user = null
  fromCalls.length = 0
  storageCalls.length = 0
  functionsInvoke.mockClear()
}
