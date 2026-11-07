// S04 codemod: ek hi Supabase browser client (src/lib/supabase.ts).
// Dry-run by default (kuch change nahi karta).   Apply: npx tsx scripts/s04-consolidate-client.ts --apply
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { readTree } from './s04-fs.ts'
import { planConsolidation } from './s04-lib.ts'

const apply = process.argv.includes('--apply')
const files = readTree('src', ['.ts', '.tsx'])
const plan = planConsolidation(files)

if (plan.problems.length) {
  console.error(plan.problems.join('\n'))
  process.exit(1)
}
if (!plan.legacy.length) {
  console.log('Nothing to do: no second Supabase client found.')
  process.exit(0)
}

console.log(`Legacy client file(s) to remove: ${plan.legacy.join(', ')}`)
for (const e of plan.edits) console.log(`  ${e.file}: '${e.from}'  ->  '${e.to}'`)
console.log(`\n${plan.edits.length} import(s) in ${plan.newTexts.size} file(s) will change.`)

if (!apply) {
  console.log('Dry run only. Re-run with --apply to write the changes.')
  process.exit(0)
}

for (const [file, text] of plan.newTexts) writeFileSync(file, text)
for (const legacy of plan.legacy) rmSync(legacy)

const map = `# S04 single-client migration map

Canonical client: src/lib/supabase.ts (throws if env is missing, so the client is never null).
Removed: ${plan.legacy.join(', ')}

| File | Old import | New import |
|---|---|---|
${plan.edits.map((e) => `| ${e.file} | ${e.from} | ${e.to} |`).join('\n')}
`
mkdirSync('docs', { recursive: true })
writeFileSync('docs/S04-client-migration-map.md', map)
console.log('Applied. Map written to docs/S04-client-migration-map.md. Now run: npm run build')
