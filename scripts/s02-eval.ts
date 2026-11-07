// S02 provider evaluation: approved NON-SENSITIVE test photos ko deployed analyze-image par chalata hai.
// Setup: eval/cases.json banao (eval/cases.example.json dekho), images eval/images/ mein rakho (git mein commit nahi hoti).
// Env (.env ya terminal): VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, EVAL_EMAIL, EVAL_PASSWORD
// Run (repo root se):  npx tsx scripts/s02-eval.ts
import { createClient, FunctionsHttpError } from '@supabase/supabase-js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

try {
  process.loadEnvFile('.env')
} catch {
  // .env optional hai; terminal env bhi chalega
}

interface Case { file: string; description: string; reality?: string }
interface Row { file: string; ok: boolean; code: string; latencyMs: number; issue: string; confidence: string; severity: string; reality: string }

const MEDIA: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const email = process.env.EVAL_EMAIL
const password = process.env.EVAL_PASSWORD
const delayMs = Number(process.env.EVAL_DELAY_MS ?? 21000) // default per-minute limit (3) ke andar rehne ke liye

if (!url || !key || !email || !password) {
  console.error('Missing env. Need VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, EVAL_EMAIL, EVAL_PASSWORD')
  process.exit(1)
}
if (!existsSync('eval/cases.json')) {
  console.error('eval/cases.json not found. Copy eval/cases.example.json and edit it.')
  process.exit(1)
}

const cases = JSON.parse(readFileSync('eval/cases.json', 'utf8')) as Case[]
const supabase = createClient(url, key, { auth: { persistSession: false } })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const signIn = await supabase.auth.signInWithPassword({ email, password })
if (signIn.error) {
  console.error('Eval account sign-in failed:', signIn.error.message)
  process.exit(1)
}

const rows: Row[] = []
for (const [index, c] of cases.entries()) {
  const path = join('eval', c.file)
  const mediaType = MEDIA[extname(path).toLowerCase()]
  if (!existsSync(path) || !mediaType) {
    rows.push({ file: c.file, ok: false, code: 'skipped (missing file / unsupported type)', latencyMs: 0, issue: '-', confidence: '-', severity: '-', reality: c.reality ?? '' })
    continue
  }
  const imageBase64 = readFileSync(path).toString('base64')
  const started = Date.now()
  const { data, error } = await supabase.functions.invoke('analyze-image', {
    body: { imageBase64, mediaType, description: c.description },
  })
  const latencyMs = Date.now() - started

  let row: Row
  if (error) {
    let code = 'service_unavailable'
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { error?: { code?: string } }
        code = body.error?.code ?? `http_${error.context.status}`
      } catch {
        code = `http_${error.context.status}`
      }
    }
    row = { file: c.file, ok: false, code, latencyMs, issue: '-', confidence: '-', severity: '-', reality: c.reality ?? '' }
  } else {
    const d = (data as { ok?: boolean; data?: { issueName?: string; confidence?: number; severity?: string } })?.data
    row = {
      file: c.file, ok: (data as { ok?: boolean })?.ok === true, code: 'success', latencyMs,
      issue: d?.issueName ?? '-', confidence: String(d?.confidence ?? '-'), severity: d?.severity ?? '-', reality: c.reality ?? '',
    }
  }
  rows.push(row)
  console.log(`${row.ok ? 'OK  ' : 'FAIL'} ${row.file} -> ${row.code} (${row.latencyMs} ms) ${row.issue}`)

  if (row.code === 'quota_exceeded') {
    console.log('Daily quota reached - stopping early so we do not burn more quota.')
    break
  }
  if (index < cases.length - 1) await sleep(delayMs)
}

const okRows = rows.filter((r) => r.ok)
const avg = okRows.length ? Math.round(okRows.reduce((s, r) => s + r.latencyMs, 0) / okRows.length) : 0
const codes = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.code]: (m[r.code] ?? 0) + 1 }), {})
const esc = (v: string) => v.replace(/\|/g, '/')

const md = `# Provider evaluation results (generated)

- Date: ${new Date().toISOString()}
- Cases run: ${rows.length} | Valid responses: ${okRows.length} | Avg latency (successes): ${avg} ms
- Outcome counts: ${Object.entries(codes).map(([k, v]) => `${k}=${v}`).join(', ')}

| Image | Result | Latency (ms) | Issue returned | Confidence | Severity | Reality (you fill) | Matches? (Y/N) |
|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${esc(r.file)} | ${esc(r.code)} | ${r.latencyMs} | ${esc(r.issue)} | ${r.confidence} | ${r.severity} | ${esc(r.reality)} | |`).join('\n')}

Note: "Valid responses" only means the output passed schema validation. Whether the diagnosis is correct is judged by a human in the last column. Confidence is the model's own number, not a probability guarantee.
`
writeFileSync('docs/provider-evaluation-results.md', md)
console.log('\nReport written to docs/provider-evaluation-results.md')
