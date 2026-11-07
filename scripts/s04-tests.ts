// S04 tests (no network). Run:  npx tsx scripts/s04-tests.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createUserIdentifier, extractBearerToken } from '../supabase/functions/_shared/auth.ts'
import { ConfigurationError } from '../supabase/functions/_shared/errors.ts'
import { readTree } from './s04-fs.ts'
import {
  checkClient, listEndpoints, planConsolidation, relativeSpec, resolveRelative, runAuthProbes, tamperJwt,
  type SrcFile,
} from './s04-lib.ts'

async function run(name: string, fn: () => void | Promise<void>) {
  await fn()
  console.log('PASS', name)
}
const req = (auth?: string) => new Request('http://x', { method: 'POST', headers: auth ? { Authorization: auth } : {} })

// ------------------------------------------------ shared auth helper
const fakeClient = (result: { user: { id: string } | null; error: { status?: number; name?: string } | null }) => {
  const calls: string[] = []
  return { calls, createClient: () => ({ auth: { getUser: async (t: string) => { calls.push(t); return { data: { user: result.user }, error: result.error } } } }) }
}

await run('bearer token parsing', () => {
  assert.equal(extractBearerToken(req('Bearer abc')), 'abc')
  assert.equal(extractBearerToken(req('bearer   abc  ')), 'abc')
  assert.equal(extractBearerToken(req('Basic abc')), null)
  assert.equal(extractBearerToken(req()), null)
  assert.equal(extractBearerToken(req('Bearer ')), null)
})
await run('identifyUser: missing config -> ConfigurationError', async () => {
  const f = fakeClient({ user: null, error: null })
  await assert.rejects(createUserIdentifier({ url: undefined, anonKey: 'k', createClient: f.createClient })(req('Bearer t')), ConfigurationError)
  await assert.rejects(createUserIdentifier({ url: 'u', anonKey: undefined, createClient: f.createClient })(req('Bearer t')), ConfigurationError)
})
await run('identifyUser: no token -> null and auth server is not even called', async () => {
  const f = fakeClient({ user: { id: 'u1' }, error: null })
  assert.equal(await createUserIdentifier({ url: 'u', anonKey: 'k', createClient: f.createClient })(req()), null)
  assert.equal(f.calls.length, 0)
})
await run('identifyUser: valid / invalid / expired / auth outage', async () => {
  const id = (r: Parameters<typeof fakeClient>[0]) => createUserIdentifier({ url: 'u', anonKey: 'k', createClient: fakeClient(r).createClient })(req('Bearer t'))
  assert.equal(await id({ user: { id: 'user-1' }, error: null }), 'user-1')
  assert.equal(await id({ user: null, error: { status: 401, name: 'AuthApiError' } }), null)
  assert.equal(await id({ user: null, error: { status: 403 } }), null)
  assert.equal(await id({ user: null, error: { name: 'AuthSessionMissingError' } }), null)
  await assert.rejects(id({ user: null, error: { status: 503 } }), /auth service unavailable/)
  await assert.rejects(id({ user: null, error: { status: 0, name: 'AuthRetryableFetchError' } }), /auth service unavailable/)
})

// ------------------------------------------------ path helpers + codemod
await run('relative path helpers', () => {
  assert.equal(resolveRelative('src/Pages/Auth.tsx', '../services/supabase'), 'src/services/supabase')
  assert.equal(resolveRelative('src/services/visionAI.ts', './supabase'), 'src/services/supabase')
  assert.equal(resolveRelative('src/App.tsx', './services/supabase.ts'), 'src/services/supabase')
  assert.equal(resolveRelative('src/App.tsx', 'react'), null)
  assert.equal(relativeSpec('src/Pages/Auth.tsx', 'src/lib/supabase'), '../lib/supabase')
  assert.equal(relativeSpec('src/services/visionAI.ts', 'src/lib/supabase'), '../lib/supabase')
  assert.equal(relativeSpec('src/App.tsx', 'src/lib/supabase'), './lib/supabase')
  assert.equal(relativeSpec('src/components/ui/Deep.tsx', 'src/lib/supabase'), '../../lib/supabase')
})

const CANON = "import { createClient } from '@supabase/supabase-js'\nif (!import.meta.env.VITE_SUPABASE_URL) { throw new Error('Missing env') }\nexport const supabase = createClient('u','k')\n"
const LEGACY = "import { createClient } from '@supabase/supabase-js'\nexport const supabase = import.meta.env.VITE_SUPABASE_URL ? createClient('u','k') : null\n"
const before = (): SrcFile[] => [
  { path: 'src/lib/supabase.ts', text: CANON },
  { path: 'src/services/supabase.ts', text: LEGACY },
  { path: 'src/App.tsx', text: "import { supabase } from './services/supabase'\nexport default 1\n" },
  { path: 'src/Pages/Login.tsx', text: "import { supabase } from '../services/supabase'\n" },
  { path: 'src/services/historyService.ts', text: "import { supabase } from './supabase'\nimport x from \"./supabase\"\n" },
  { path: 'src/Pages/Auth.tsx', text: "import { supabase } from '../lib/supabase'\n" },
  { path: 'src/components/Barrel.ts', text: "export { supabase } from '../services/supabase'\n" },
]
await run('codemod rewrites every import of the legacy client (import, export-from, both quote styles)', () => {
  const plan = planConsolidation(before())
  assert.deepEqual(plan.legacy, ['src/services/supabase.ts'])
  assert.equal(plan.newTexts.get('src/App.tsx'), "import { supabase } from './lib/supabase'\nexport default 1\n")
  assert.equal(plan.newTexts.get('src/Pages/Login.tsx'), "import { supabase } from '../lib/supabase'\n")
  assert.match(plan.newTexts.get('src/services/historyService.ts') as string, /from '\.\.\/lib\/supabase'\nimport x from "\.\.\/lib\/supabase"/)
  assert.equal(plan.newTexts.get('src/components/Barrel.ts'), "export { supabase } from '../lib/supabase'\n")
  assert.equal(plan.newTexts.has('src/Pages/Auth.tsx'), false, 'already canonical, untouched')
})
await run('codemod refuses if the canonical client is missing', () => {
  const plan = planConsolidation(before().filter((f) => f.path !== 'src/lib/supabase.ts'))
  assert.ok(plan.problems.length > 0 && plan.edits.length === 0)
})
await run('check: before = FAIL, after codemod = no FAIL', () => {
  assert.ok(checkClient(before()).some((f) => f.status === 'FAIL' && f.area === 'client'))
  const plan = planConsolidation(before())
  const after = before().filter((f) => !plan.legacy.includes(f.path)).map((f) => ({ ...f, text: plan.newTexts.get(f.path) ?? f.text }))
  assert.deepEqual(checkClient(after).filter((f) => f.status === 'FAIL'), [])
})
await run('check: secrets, second auth system and direct env reads are flagged', () => {
  const files: SrcFile[] = [
    { path: 'src/lib/supabase.ts', text: CANON },
    { path: 'src/Pages/Bad.tsx', text: "import f from 'firebase/auth'\nconst k = 'SERVICE_ROLE'\nconst u = import.meta.env.VITE_SUPABASE_URL\nlocalStorage.setItem('access_token', 'x')\n" },
  ]
  const f = checkClient(files)
  assert.ok(f.some((x) => x.status === 'FAIL' && x.area === 'secrets'))
  assert.ok(f.some((x) => x.status === 'FAIL' && x.area === 'parallel auth'))
  assert.ok(f.some((x) => x.status === 'WARN' && x.area === 'env'))
  assert.ok(f.some((x) => x.status === 'WARN' && x.area === 'parallel auth'))
})

await run('REAL repo src/: codemod then check leaves no FAIL', () => {
  const files = readTree('src', ['.ts', '.tsx'])
  assert.ok(files.length > 10, 'src/ files were read')
  const plan = planConsolidation(files)
  assert.deepEqual(plan.problems, [])
  const after = files.filter((f) => !plan.legacy.includes(f.path)).map((f) => ({ ...f, text: plan.newTexts.get(f.path) ?? f.text }))
  assert.deepEqual(checkClient(after).filter((f) => f.status === 'FAIL'), [])
})

// ------------------------------------------------ endpoint list
await run('endpoint list: shared auth = PROTECTED, gateway-only = FAIL, body user_id = FAIL', () => {
  const fn: SrcFile[] = [
    { path: 'supabase/functions/good/index.ts', text: "import { createUserIdentifier } from '../_shared/auth.ts'" },
    { path: 'supabase/functions/gatewayonly/index.ts', text: 'Deno.serve(() => new Response("ok"))' },
    { path: 'supabase/functions/trusting/index.ts', text: "import '../_shared/auth.ts'; const id = body.user_id" },
    { path: 'supabase/functions/_shared/auth.ts', text: '' },
  ]
  const rows = listEndpoints(fn, '[functions.good]\nverify_jwt = true\n\n[functions.gatewayonly]\nverify_jwt = true\n')
  const by = Object.fromEntries(rows.map((r) => [r.name, r]))
  assert.equal(by.good.verdict, 'PROTECTED')
  assert.equal(by.good.verifyJwt, 'true')
  assert.equal(by.gatewayonly.verdict, 'FAIL')
  assert.equal(by.trusting.verdict, 'FAIL')
  assert.equal(rows.length, 3, '_shared is not an endpoint')
})
await run('REAL repo functions: analyze-image is PROTECTED', () => {
  const cfg = readFileSync('supabase/config.toml', 'utf8')
  const rows = listEndpoints(readTree('supabase/functions', ['.ts']), cfg)
  const a = rows.find((r) => r.name === 'analyze-image')
  assert.ok(a && a.verdict === 'PROTECTED', JSON.stringify(a))
})

// ------------------------------------------------ black-box probes against a fake backend
function b64(o: object) { return btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
const USER_TOKEN = `${b64({ alg: 'HS256' })}.${b64({ sub: 'user-1', exp: 4102444800, role: 'authenticated' })}.sig`
function fakeBackend(opts: { openFunction?: boolean; openDb?: boolean; brokenLogin?: boolean }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const auth = new Headers(init?.headers).get('Authorization')
    const isUser = auth === `Bearer ${USER_TOKEN}` && !opts.brokenLogin
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
    if (url.includes('/functions/v1/')) {
      if (opts.openFunction || isUser) return json(isUser ? 400 : 200, { ok: false })
      return json(401, { ok: false })
    }
    if (url.includes('/rest/v1/')) {
      const method = init?.method ?? 'GET'
      if (method === 'POST') return opts.openDb ? json(201, {}) : json(401, { code: '42501' })
      if (isUser) return json(200, [{ id: 1 }])
      return opts.openDb ? json(200, [{ id: 1 }]) : json(401, { code: '42501' })
    }
    return json(404, {})
  }) as typeof fetch
}
const probe = (opts: Parameters<typeof fakeBackend>[0]) =>
  runAuthProbes({ fetchFn: fakeBackend(opts), url: 'https://x.supabase.co', key: 'sb_publishable_abc', userToken: USER_TOKEN, functions: ['analyze-image'], tables: ['appliances', 'diagnoses'] })

await run('jwt tampering changes the payload but keeps the signature', () => {
  const t = tamperJwt(USER_TOKEN)
  assert.notEqual(t, USER_TOKEN)
  assert.equal(t.split('.')[2], 'sig')
  assert.equal(JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (t.split('.')[1].length % 4)) % 4))).sub, '00000000-0000-0000-0000-000000000000')
})
await run('probes: protected backend -> every probe passes', async () => {
  const r = await probe({})
  assert.deepEqual(r.filter((x) => !x.pass), [])
  assert.ok(r.some((x) => x.test.includes('positive control')))
})
await run('probes: open function is caught', async () => {
  const bad = (await probe({ openFunction: true })).filter((x) => !x.pass)
  assert.ok(bad.some((x) => x.area === 'function' && x.test === 'no Authorization header'))
})
await run('probes: open database is caught', async () => {
  const bad = (await probe({ openDb: true })).filter((x) => !x.pass)
  assert.ok(bad.some((x) => x.test === 'logged-out read'))
  assert.ok(bad.some((x) => x.test === 'logged-out insert'))
})
await run('probes: broken login (valid users rejected) is caught', async () => {
  const bad = (await probe({ brokenLogin: true })).filter((x) => !x.pass)
  assert.ok(bad.some((x) => x.test.includes('positive control')))
})

console.log('\nAll S04 tests passed.')
