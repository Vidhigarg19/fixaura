// S04 black-box probe against the DEPLOYED project: logged-out requests must be denied, logged-in must work.
// Uses a dedicated TEST account. Env: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, S04_EMAIL, S04_PASSWORD
// Optional: S04_FUNCTIONS=analyze-image,other-fn
// Run (repo root):  npx tsx scripts/s04-auth-probe.ts
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { renderProbes, runAuthProbes } from './s04-lib.ts'

try {
  process.loadEnvFile('.env')
} catch {
  // .env optional
}
const env = process.env
const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'S04_EMAIL', 'S04_PASSWORD'].filter((n) => !env[n])
if (missing.length) {
  console.error(`Missing env: ${missing.join(', ')}`)
  process.exit(1)
}
const url = (env.VITE_SUPABASE_URL as string).replace(/\/$/, '')
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY as string

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const { data, error } = await client.auth.signInWithPassword({ email: env.S04_EMAIL as string, password: env.S04_PASSWORD as string })
if (error || !data.session) {
  console.error(`Test login failed: ${error?.message}`)
  process.exit(1)
}

const results = await runAuthProbes({
  fetchFn: fetch,
  url,
  key,
  userToken: data.session.access_token,
  functions: (env.S04_FUNCTIONS ?? 'analyze-image').split(',').map((s) => s.trim()).filter(Boolean),
  tables: ['repair_sessions', 'chat_messages', 'repair_step_progress', 'diagnoses', 'appliances', 'completed_repairs'],
})
writeFileSync('docs/auth-probe-evidence.md', renderProbes(results))
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} [${r.area}] ${r.target}: ${r.test} -> ${r.actual}`)
const bad = results.filter((r) => !r.pass).length
console.log(`\n${bad} failure(s). Evidence: docs/auth-probe-evidence.md`)
process.exit(bad ? 2 : 0)
