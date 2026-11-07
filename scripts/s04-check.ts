// S04 static check: one client, no parallel auth, every Edge Function verifies the user.
// Run (repo root):  npx tsx scripts/s04-check.ts      (writes docs/S04-report.md, exit 2 if any FAIL)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readTree } from './s04-fs.ts'
import { checkClient, listEndpoints, renderReport } from './s04-lib.ts'

const client = checkClient(readTree('src', ['.ts', '.tsx']))
const config = existsSync('supabase/config.toml') ? readFileSync('supabase/config.toml', 'utf8') : ''
const endpoints = listEndpoints(readTree('supabase/functions', ['.ts']), config)

writeFileSync('docs/S04-report.md', renderReport(client, endpoints))
for (const f of client) console.log(`${f.status.padEnd(4)} ${f.area.padEnd(14)} ${f.target}  ${f.finding}`)
for (const e of endpoints) console.log(`${e.verdict.padEnd(9)} function ${e.name} (gateway verify_jwt: ${e.verifyJwt}, user check in code: ${e.userCheck ? 'yes' : 'NO'})`)
const fails = client.filter((f) => f.status === 'FAIL').length + endpoints.filter((e) => e.verdict === 'FAIL').length
console.log(`\n${fails} FAIL. Report: docs/S04-report.md`)
process.exit(fails ? 2 : 0)
