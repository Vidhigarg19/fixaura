// S03: repo vs live schema comparison.
// 1) Run supabase/audit/live_schema_audit.sql in the Supabase SQL Editor (read-only).
// 2) Save the single result cell to docs/schema/live-snapshot.json
// 3) Run (repo root):  npx tsx scripts/s03-compare.ts
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { compareSchema, renderComparison, validateSnapshot, type Expected } from './s03-lib.ts'

const SNAPSHOT = 'docs/schema/live-snapshot.json'
if (!existsSync(SNAPSHOT)) {
  console.error(`${SNAPSHOT} not found. Run supabase/audit/live_schema_audit.sql in the SQL Editor and save the result cell there.`)
  process.exit(1)
}

function parseJson(text: string): unknown {
  let value: unknown = JSON.parse(text.trim())
  if (typeof value === 'string') value = JSON.parse(value) // cell was copied as a quoted string
  return value
}

let raw: unknown
try {
  raw = parseJson(readFileSync(SNAPSHOT, 'utf8'))
} catch {
  console.error('Could not parse the snapshot. It must be the exact JSON text from the SQL result cell (it looks cut off or edited).')
  process.exit(1)
}

const expected = JSON.parse(readFileSync('docs/schema/expected-schema.json', 'utf8')) as Expected
const check = validateSnapshot(raw, Object.keys(expected.tables))
if (!check.ok) {
  console.error('The snapshot is INCOMPLETE, so the comparison would be meaningless (many false FAILs). Not running it.\n')
  for (const p of check.problems) console.error(`  - ${p}`)
  console.error('\nFix: re-run supabase/audit/live_schema_audit.sql unchanged in the SQL Editor, copy the WHOLE result cell, and save it as docs/schema/live-snapshot.json.')
  process.exit(3)
  throw new Error('unreachable') // helps TypeScript narrow `check` below
}
console.log(`Snapshot loaded: ${check.summary}\n`)
const snapshot = check.snapshot
const migrations = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .map((name) => ({ name, sql: readFileSync(`supabase/migrations/${name}`, 'utf8') }))

const findings = compareSchema(snapshot, expected, migrations)
writeFileSync('docs/schema-comparison.md', renderComparison(findings))
for (const f of findings) console.log(`${f.status.padEnd(4)} ${f.area.padEnd(15)} ${f.table.padEnd(22)} ${f.finding}`)
const fails = findings.filter((f) => f.status === 'FAIL').length
console.log(`\n${fails} FAIL. Report written to docs/schema-comparison.md`)
process.exit(fails ? 2 : 0)
