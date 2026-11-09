// S04 pure logic (no network, no Node APIs) so everything here is testable.

export interface SrcFile { path: string; text: string } // path is posix, relative to repo root, e.g. src/Pages/Auth.tsx

export const CANONICAL = 'src/lib/supabase' // the ONE browser client module (no extension)
// Files that may read VITE_SUPABASE_* directly: the single config module (src/config/env.ts) plus the
// client and health-check helper (kept so older checkouts still pass).
const ENV_ALLOWED = ['src/config/env.ts', 'src/lib/supabase.ts', 'src/lib/test-supabase.ts']

const stripExt = (p: string) => p.replace(/\.(tsx?|jsx?|mjs)$/, '')

export function resolveRelative(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const parts = fromFile.split('/').slice(0, -1)
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg === '') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return stripExt(parts.join('/'))
}

export function relativeSpec(fromFile: string, targetNoExt: string): string {
  const from = fromFile.split('/').slice(0, -1)
  const to = targetNoExt.split('/')
  let i = 0
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i += 1
  const up = from.length - i
  const rest = to.slice(i).join('/')
  return (up === 0 ? './' : '../'.repeat(up)) + rest
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g
export function importSpecs(text: string): string[] {
  return [...text.matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2] ?? m[3]).filter(Boolean) as string[]
}

const isClientFile = (f: SrcFile) => /@supabase\/supabase-js/.test(f.text) && /\bcreateClient\s*\(/.test(f.text)

// ------------------------------------------------------------ consolidation plan (codemod)
export interface Edit { file: string; from: string; to: string }
export interface Plan { legacy: string[]; edits: Edit[]; newTexts: Map<string, string>; problems: string[] }

export function planConsolidation(files: SrcFile[]): Plan {
  const problems: string[] = []
  const hasCanonical = files.some((f) => stripExt(f.path) === CANONICAL)
  const legacyFiles = files.filter((f) => isClientFile(f) && stripExt(f.path) !== CANONICAL)
  const legacyMods = new Set(legacyFiles.map((f) => stripExt(f.path)))
  if (!hasCanonical && legacyFiles.length) problems.push(`${CANONICAL}.ts does not exist; create it first (it must export a non-null "supabase" client).`)

  const edits: Edit[] = []
  const newTexts = new Map<string, string>()
  if (problems.length) return { legacy: [], edits, newTexts, problems }

  for (const f of files) {
    if (legacyMods.has(stripExt(f.path))) continue
    let text = f.text
    for (const spec of new Set(importSpecs(f.text))) {
      const target = resolveRelative(f.path, spec)
      if (target && legacyMods.has(target)) {
        const to = relativeSpec(f.path, CANONICAL)
        text = text.split(`'${spec}'`).join(`'${to}'`).split(`"${spec}"`).join(`"${to}"`)
        edits.push({ file: f.path, from: spec, to })
      }
    }
    if (text !== f.text) newTexts.set(f.path, text)
  }
  return { legacy: legacyFiles.map((f) => f.path), edits, newTexts, problems }
}

// ------------------------------------------------------------ static client check
export type Status = 'FAIL' | 'WARN' | 'INFO' | 'OK'
export interface Finding { status: Status; area: string; target: string; finding: string; action: string }

export function checkClient(files: SrcFile[]): Finding[] {
  const out: Finding[] = []
  const add = (status: Status, area: string, target: string, finding: string, action: string) => out.push({ status, area, target, finding, action })

  const creators = files.filter(isClientFile).map((f) => f.path)
  if (creators.length === 0) add('FAIL', 'client', '-', 'No file creates the Supabase client.', `Create ${CANONICAL}.ts`)
  else if (creators.length > 1) add('FAIL', 'client', creators.join(', '), `${creators.length} files create a Supabase client (must be exactly 1).`, `Keep only ${CANONICAL}.ts (scripts/s04-consolidate-client.ts)`)
  else if (stripExt(creators[0]) !== CANONICAL) add('FAIL', 'client', creators[0], `The only client is not at ${CANONICAL}.ts.`, 'Move it to the canonical path')

  const canonicalFile = files.find((f) => stripExt(f.path) === CANONICAL)
  if (canonicalFile && !/\bthrow\s+new\s+Error/.test(canonicalFile.text)) {
    add('WARN', 'client', canonicalFile.path, 'Client does not throw when env is missing (null-able client?).', 'Fail fast with a clear message so every caller can rely on a non-null client.')
  }

  for (const f of files) {
    if (!f.path.startsWith('src/')) continue
    if (/VITE_SUPABASE/.test(f.text) && !ENV_ALLOWED.includes(f.path)) add('WARN', 'env', f.path, 'Reads VITE_SUPABASE_* directly.', 'Import the client from the canonical module instead.')
    if (/service_role|SERVICE_ROLE|sb_secret_/.test(f.text)) add('FAIL', 'secrets', f.path, 'Service-role / secret key name found in browser code.', 'Remove it. Secret keys live only in Supabase Function secrets.')
    if (/from\s*['"](firebase|next-auth|@auth0|@clerk|passport)/.test(f.text)) add('FAIL', 'parallel auth', f.path, 'A second auth system is imported.', 'Use Supabase Auth only.')
    if (/localStorage\.(get|set)Item\(\s*['"][^'"]*(token|jwt|access)[^'"]*['"]/i.test(f.text)) add('WARN', 'parallel auth', f.path, 'Manual token storage in localStorage.', 'Let supabase-js manage the session.')
    for (const spec of new Set(importSpecs(f.text))) {
      const target = resolveRelative(f.path, spec)
      if (target && /(^|\/)supabase$/.test(target) && target !== CANONICAL) add('FAIL', 'client', f.path, `Imports a non-canonical client module "${spec}".`, `Import from ${CANONICAL}`)
    }
  }
  const listeners = files.filter((f) => f.path.startsWith('src/') && /onAuthStateChange\s*\(/.test(f.text)).map((f) => f.path)
  if (listeners.length > 1) add('WARN', 'auth listeners', listeners.join(', '), `${listeners.length} files subscribe to onAuthStateChange separately.`, 'Optional (Phase B): move to the existing AuthProvider / useAuth.')
  if (!out.some((f) => f.status === 'FAIL' || f.status === 'WARN')) add('OK', 'summary', '-', 'One client, no parallel auth.', '-')
  return out
}

// ------------------------------------------------------------ Edge Function protection list
export interface EndpointRow { name: string; verifyJwt: string; userCheck: boolean; bodyUserId: boolean; verdict: 'PROTECTED' | 'FAIL' }

export function listEndpoints(fnFiles: SrcFile[], configToml: string): EndpointRow[] {
  const names = [...new Set(fnFiles.map((f) => f.path.split('/')[2]).filter((n) => n && !n.startsWith('_')))].sort()
  return names.map((name) => {
    const text = fnFiles.filter((f) => f.path.startsWith(`supabase/functions/${name}/`)).map((f) => f.text).join('\n')
    const userCheck = /_shared\/auth/.test(text) || /auth\.getUser\(/.test(text)
    const bodyUserId = /\b(body|input|payload|data)\??\.user_?[iI]d\b/.test(text)
    const section = new RegExp(`\\[functions\\.${name}\\]([^\\[]*)`).exec(configToml)?.[1] ?? ''
    const m = /verify_jwt\s*=\s*(true|false)/.exec(section)
    const verifyJwt = m ? m[1] : 'default (true)'
    // Gateway verify_jwt alone accepts the public anon key, so it is NOT a user check.
    return { name, verifyJwt, userCheck, bodyUserId, verdict: userCheck && !bodyUserId ? 'PROTECTED' : 'FAIL' }
  })
}

export function renderReport(client: Finding[], endpoints: EndpointRow[]): string {
  const esc = (v: string) => v.replace(/\|/g, '/')
  return `# S04 report: one client + protected endpoints

Generated: ${new Date().toISOString()}

## Browser client check
| Status | Area | Target | Finding | Action |
|---|---|---|---|---|
${client.map((f) => `| ${f.status} | ${f.area} | ${esc(f.target)} | ${esc(f.finding)} | ${esc(f.action)} |`).join('\n')}

## Protected endpoint list (Edge Functions)
| Function | verify_jwt (gateway) | Verifies the USER in code | Reads user id from body | Verdict |
|---|---|---|---|---|
${endpoints.map((e) => `| ${e.name} | ${e.verifyJwt} | ${e.userCheck ? 'yes' : 'NO'} | ${e.bodyUserId ? 'YES (bad)' : 'no'} | ${e.verdict} |`).join('\n')}

Note: the gateway check (verify_jwt) also accepts the public anon key, so it is not proof of a logged-in user. The in-code check (_shared/auth.ts) is the real one.
`
}

// ------------------------------------------------------------ black-box auth probes
export interface ProbeDeps { fetchFn: typeof fetch; url: string; key: string; userToken: string | null; functions: string[]; tables: string[] }
export interface ProbeResult { area: 'function' | 'database'; target: string; test: string; expected: string; actual: string; pass: boolean }

export function tamperJwt(token: string): string {
  const [h, p, s] = token.split('.')
  const b64 = (x: string) => x.replace(/-/g, '+').replace(/_/g, '/')
  const payload = JSON.parse(atob(b64(p) + '='.repeat((4 - (p.length % 4)) % 4))) as Record<string, unknown>
  payload.exp = 1000000000
  payload.sub = '00000000-0000-0000-0000-000000000000'
  const enc = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${h}.${enc}.${s}`
}

export async function runAuthProbes(d: ProbeDeps): Promise<ProbeResult[]> {
  const res: ProbeResult[] = []
  const rec = (area: ProbeResult['area'], target: string, test: string, expected: string, actual: string, pass: boolean) =>
    res.push({ area, target, test, expected, actual, pass })
  const call = async (path: string, init: RequestInit) => {
    try {
      const r = await d.fetchFn(`${d.url}${path}`, init)
      const text = await r.text().catch(() => '')
      return { status: r.status, text }
    } catch (e) {
      return { status: 0, text: String(e) }
    }
  }
  const denied = (s: number) => s === 401 || s === 403

  for (const fn of d.functions) {
    const path = `/functions/v1/${fn}`
    const base = { 'Content-Type': 'application/json', apikey: d.key }
    const post = (auth: string | null) => call(path, { method: 'POST', headers: auth ? { ...base, Authorization: auth } : base, body: '{}' })
    const cases: [string, string | null][] = [
      ['no Authorization header', null],
      ['public key used as bearer (not a user)', `Bearer ${d.key}`],
      ['garbage token', 'Bearer abc.def.ghi'],
    ]
    if (d.userToken) cases.push(['tampered / expired-looking user token', `Bearer ${tamperJwt(d.userToken)}`])
    for (const [name, auth] of cases) {
      const r = await post(auth)
      rec('function', fn, name, '401/403', `HTTP ${r.status}`, denied(r.status))
    }
    if (d.userToken) {
      const r = await post(`Bearer ${d.userToken}`)
      rec('function', fn, 'valid login (positive control, empty body)', 'not 401/403 (auth passes)', `HTTP ${r.status}`, r.status !== 0 && !denied(r.status))
    }
  }

  for (const t of d.tables) {
    const anon = { apikey: d.key }
    const read = await call(`/rest/v1/${t}?select=*&limit=1`, { headers: anon })
    let rows: number
    try { rows = (JSON.parse(read.text) as unknown[]).length } catch { rows = -1 }
    const readOk = denied(read.status) || read.status === 404 || (read.status === 200 && rows === 0)
    rec('database', t, 'logged-out read', '401/403 or 0 rows', read.status === 200 ? `HTTP 200, ${rows} row(s)` : `HTTP ${read.status}`, readOk)

    const ins = await call(`/rest/v1/${t}`, { method: 'POST', headers: { ...anon, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: '{}' })
    rec('database', t, 'logged-out insert', '4xx (blocked)', `HTTP ${ins.status}`, ins.status >= 400 && ins.status < 500)

    if (d.userToken) {
      const own = await call(`/rest/v1/${t}?select=*&limit=1`, { headers: { ...anon, Authorization: `Bearer ${d.userToken}` } })
      rec('database', t, 'logged-in read (positive control)', 'HTTP 200', `HTTP ${own.status}`, own.status === 200)
    }
  }
  return res
}

export function renderProbes(results: ProbeResult[]): string {
  const bad = results.filter((r) => !r.pass)
  return `# Auth probe evidence (S04)

Generated: ${new Date().toISOString()}

Result: ${bad.length === 0 ? 'PASS (logged-out requests denied, logged-in works)' : `FAIL (${bad.length} problem(s))`}

| Area | Target | Test | Expected | Actual | Pass |
|---|---|---|---|---|---|
${results.map((r) => `| ${r.area} | ${r.target} | ${r.test} | ${r.expected} | ${r.actual} | ${r.pass ? 'PASS' : 'FAIL'} |`).join('\n')}
`
}
