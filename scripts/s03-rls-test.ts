// S03: account A vs account B allow/deny evidence. Use DEDICATED TEST accounts only (never real users).
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { renderRls, runRlsChecks, type DbApi, type Row } from './s03-lib.ts'

const url = "https://ohqsjvvvbpcmfrztchct.supabase.co"
const key = "sb_publishable_SHen-Z1ZgRF5hzDmP4ftnA_9e4Ni4id"

const emailA: string = "rls-a@example.com"
const passwordA = "123456"
const emailB: string = "rls-b@example.com"
const passwordB = "123456"

if (emailA === emailB) {
  console.error('Account A and B must be different users.')
  process.exit(1)
}

const options = { auth: { persistSession: false, autoRefreshToken: false } }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrap(client: any, userId: string | null): DbApi {
  return {
    userId,
    async insert(table: string, row: Row) {
      const { error } = await client.from(table).insert(row)
      return error ? { error: error.message as string } : {}
    },
    async count(table: string, column: string, value: string) {
      const { count, error } = await client.from(table).select('*', { count: 'exact', head: true }).eq(column, value)
      return error ? { rows: 0, error: error.message as string } : { rows: (count ?? 0) as number }
    },
    async update(table: string, column: string, value: string, patch: Row) {
      const { data, error } = await client.from(table).update(patch).eq(column, value).select()
      return error ? { affected: 0, error: error.message as string } : { affected: (data?.length ?? 0) as number }
    },
    async remove(table: string, column: string, value: string) {
      const { data, error } = await client.from(table).delete().eq(column, value).select()
      return error ? { affected: 0, error: error.message as string } : { affected: (data?.length ?? 0) as number }
    },
  }
}

async function login(email: string, password: string) {
  const client = createClient(url, key, options)
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    console.error(`Sign-in failed for ${email}: ${error?.message}`)
    process.exit(1)
  }
  return wrap(client, data.user.id)
}

async function main() {
  const a = await login(emailA, passwordA)
  const b = await login(emailB, passwordB)
  const anon = wrap(createClient(url, key, options), null)

  const results = await runRlsChecks(a, b, anon, () => randomUUID())
  writeFileSync('docs/rls-test-evidence.md', renderRls(results))
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} [${r.kind}] ${r.test} -> ${r.actual}`)
  }
  const core = results.filter((r) => !r.pass && r.kind !== 'HARDENING').length
  console.log(`\n${core} core failure(s). Evidence written to docs/rls-test-evidence.md`)
  process.exit(core ? 2 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})