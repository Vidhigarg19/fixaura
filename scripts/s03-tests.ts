// S03 tests (no network). Run:  npx tsx scripts/s03-tests.ts
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import {
  compareSchema, runRlsChecks, validateSnapshot,
  type DbApi, type Expected, type Row, type Snapshot,
} from './s03-lib.ts'

const expected = JSON.parse(readFileSync('docs/schema/expected-schema.json', 'utf8')) as Expected
const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'))
  .map((name) => ({ name, sql: readFileSync(`supabase/migrations/${name}`, 'utf8') }))

async function run(name: string, fn: () => void | Promise<void>) {
  await fn()
  console.log('PASS', name)
}
const has = (fs: ReturnType<typeof compareSchema>, status: string, area: string, text: string) =>
  fs.some((f) => f.status === status && f.area === area && (f.table + ' ' + f.finding).includes(text))

// ---- a snapshot that matches what the repo's OLD SQL would create
function oldLocalSnapshot(): Snapshot {
  const col = (table: string, column: string, type: string, nullable: boolean, def: string | null = null) => ({ table, column, type, nullable, default: def })
  return {
    tables_present: ['repair_sessions', 'chat_messages', 'repair_step_progress'],
    columns: [
      col('repair_sessions', 'id', 'uuid', false, 'gen_random_uuid()'), col('repair_sessions', 'user_id', 'uuid', false),
      col('repair_sessions', 'issue_name', 'text', false), col('repair_sessions', 'diagnosis', 'jsonb', false), col('repair_sessions', 'steps', 'jsonb', false),
      col('repair_sessions', 'status', 'text', false, "'in_progress'::text"), col('repair_sessions', 'current_step', 'integer', false, '0'),
      col('repair_sessions', 'title', 'text', true), col('repair_sessions', 'description', 'text', true), col('repair_sessions', 'image_path', 'text', true),
      col('repair_sessions', 'created_at', 'timestamp with time zone', false, 'now()'), col('repair_sessions', 'updated_at', 'timestamp with time zone', false, 'now()'),
      col('repair_sessions', 'completed_at', 'timestamp with time zone', true),
      col('chat_messages', 'id', 'uuid', false, 'gen_random_uuid()'), col('chat_messages', 'session_id', 'uuid', false), col('chat_messages', 'user_id', 'uuid', false),
      col('chat_messages', 'role', 'text', false), col('chat_messages', 'content', 'text', false), col('chat_messages', 'created_at', 'timestamp with time zone', false, 'now()'),
      col('repair_step_progress', 'repair_session_id', 'uuid', false), col('repair_step_progress', 'step_id', 'text', false), col('repair_step_progress', 'status', 'text', false),
      col('repair_step_progress', 'created_at', 'timestamp with time zone', false, 'now()'), col('repair_step_progress', 'updated_at', 'timestamp with time zone', false, 'now()'),
    ],
    constraints: [], indexes: [],
    rls: ['repair_sessions', 'chat_messages', 'repair_step_progress'].map((table) => ({ table, enabled: true, forced: false })),
    policies: [
      { table: 'repair_sessions', name: 'r', permissive: 'PERMISSIVE', cmd: 'SELECT', roles: ['public'], using: '(user_id = ( SELECT auth.uid() AS uid))', check: null },
      { table: 'repair_sessions', name: 'i', permissive: 'PERMISSIVE', cmd: 'INSERT', roles: ['public'], using: null, check: '(user_id = ( SELECT auth.uid() AS uid))' },
      { table: 'repair_sessions', name: 'u', permissive: 'PERMISSIVE', cmd: 'UPDATE', roles: ['public'], using: '(user_id = ( SELECT auth.uid() AS uid))', check: '(user_id = ( SELECT auth.uid() AS uid))' },
      { table: 'repair_sessions', name: 'd', permissive: 'PERMISSIVE', cmd: 'DELETE', roles: ['public'], using: '(user_id = ( SELECT auth.uid() AS uid))', check: null },
      { table: 'chat_messages', name: 'r', permissive: 'PERMISSIVE', cmd: 'SELECT', roles: ['public'], using: '(user_id = ( SELECT auth.uid() AS uid))', check: null },
      { table: 'chat_messages', name: 'i', permissive: 'PERMISSIVE', cmd: 'INSERT', roles: ['public'], using: null, check: '(user_id = ( SELECT auth.uid() AS uid))' },
      { table: 'chat_messages', name: 'u', permissive: 'PERMISSIVE', cmd: 'UPDATE', roles: ['public'], using: '(user_id = ( SELECT auth.uid() AS uid))', check: '(user_id = ( SELECT auth.uid() AS uid))' },
      { table: 'chat_messages', name: 'd', permissive: 'PERMISSIVE', cmd: 'DELETE', roles: ['public'], using: '(user_id = ( SELECT auth.uid() AS uid))', check: null },
      { table: 'repair_step_progress', name: 'all', permissive: 'PERMISSIVE', cmd: 'ALL', roles: ['authenticated'], using: '(EXISTS ( SELECT 1 FROM repair_sessions rs WHERE (rs.user_id = ( SELECT auth.uid() AS uid))))', check: '(EXISTS ( SELECT 1 FROM repair_sessions rs WHERE (rs.user_id = ( SELECT auth.uid() AS uid))))' },
    ],
    grants: [
      ...['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'].flatMap((privilege) => [
        { table: 'repair_sessions', grantee: 'authenticated', privilege }, { table: 'repair_sessions', grantee: 'anon', privilege },
        { table: 'chat_messages', grantee: 'authenticated', privilege }, { table: 'chat_messages', grantee: 'anon', privilege },
      ]),
      ...['SELECT', 'INSERT', 'UPDATE'].map((privilege) => ({ table: 'repair_step_progress', grantee: 'authenticated', privilege })),
    ],
    functions: [], storage_buckets: [],
  }
}

// ---- a snapshot of the state AFTER the reconcile migration
function fixedSnapshot(): Snapshot {
  const tables = Object.keys(expected.tables)
  const columns: Snapshot['columns'] = []
  const policies: Snapshot['policies'] = []
  const grants: Snapshot['grants'] = []
  for (const t of tables) {
    for (const [column, type] of Object.entries(expected.tables[t].columns)) {
      columns.push({ table: t, column, type: type ?? 'integer', nullable: column !== 'id', default: column === 'id' ? 'gen_random_uuid()' : null })
    }
    for (const op of expected.tables[t].operations) {
      policies.push({ table: t, name: `owner ${op}`, permissive: 'PERMISSIVE', cmd: op.toUpperCase(), roles: ['authenticated'],
        using: op === 'insert' ? null : '(user_id = ( SELECT auth.uid() AS uid))', check: op === 'select' || op === 'delete' ? null : '(user_id = ( SELECT auth.uid() AS uid))' })
      grants.push({ table: t, grantee: 'authenticated', privilege: op.toUpperCase() })
    }
  }
  for (const r of expected.linkOwnership ?? []) {
    policies.push({ table: r.table, name: `link ${r.cmd}`, permissive: 'RESTRICTIVE', cmd: r.cmd.toUpperCase(), roles: ['authenticated'],
      using: 'true', check: r.mustMention.map((m) => `EXISTS (SELECT 1 FROM ${m})`).join(' AND ') })
  }
  return {
    tables_present: tables, columns, rls: tables.map((table) => ({ table, enabled: true, forced: false })), policies, grants,
    constraints: [], indexes: [{ table: 'completed_repairs', name: 'completed_repairs_user_diagnosis_key', definition: 'CREATE UNIQUE INDEX completed_repairs_user_diagnosis_key ON public.completed_repairs USING btree (user_id, diagnosis_id)' }],
    functions: [], storage_buckets: [],
  }
}

await run('old repo SQL snapshot: the known problems are all detected', () => {
  const f = compareSchema(oldLocalSnapshot(), expected, migrations)
  for (const t of ['diagnoses', 'appliances', 'completed_repairs']) assert.ok(has(f, 'FAIL', 'live schema', t), `missing table ${t}`)
  assert.ok(has(f, 'FAIL', 'columns', 'appliance_id'))
  assert.ok(has(f, 'FAIL', 'columns', 'diagnosis_id'))
  assert.ok(has(f, 'FAIL', 'insert shape', 'issue_name'), 'Diagnosis.tsx insert blocked by NOT NULL')
  assert.ok(has(f, 'WARN', 'grants', 'anon has privileges'))
  assert.ok(has(f, 'WARN', 'grants', 'TRUNCATE'))
  assert.ok(has(f, 'WARN', 'link ownership', 'repair_sessions'))
  assert.ok(has(f, 'WARN', 'link ownership', 'chat_messages'))
})

await run('state after reconcile migration: no FAIL / WARN', () => {
  const f = compareSchema(fixedSnapshot(), expected, migrations)
  const bad = f.filter((x) => x.status === 'FAIL' || x.status === 'WARN')
  assert.deepEqual(bad, [])
})

await run('repo migrations: every table has CREATE TABLE and order is valid', () => {
  const f = compareSchema(fixedSnapshot(), expected, migrations)
  assert.ok(!f.some((x) => x.area === 'migrations' || x.area === 'migration order'))
})

await run('migration order bug (old file name) is detected', () => {
  const broken = migrations.map((m) => (m.name.includes('create_repair_step_progress') ? { ...m, name: '20261022090000_create_repair_step_progress.sql' } : m))
  const f = compareSchema(fixedSnapshot(), expected, broken)
  assert.ok(has(f, 'FAIL', 'migration order', 'repair_sessions'))
})

await run('dangerous live settings are flagged', () => {
  const s = fixedSnapshot()
  s.policies.push({ table: 'appliances', name: 'open', permissive: 'PERMISSIVE', cmd: 'SELECT', roles: ['anon'], using: 'true', check: null })
  s.rls = s.rls.map((r) => (r.table === 'diagnoses' ? { ...r, enabled: false } : r))
  s.grants.push({ table: 'diagnoses', grantee: 'anon', privilege: 'SELECT' })
  s.storage_buckets.push({ id: 'photos', public: true })
  s.functions.push({ name: 'secret_fn', args: '', security_definer: true, acl: null })
  s.constraints = []
  s.indexes = []
  const f = compareSchema(s, expected, migrations)
  assert.ok(has(f, 'FAIL', 'policies', 'allows everything'))
  assert.ok(has(f, 'FAIL', 'RLS', 'diagnoses'))
  assert.ok(has(f, 'WARN', 'grants', 'anon has'))
  assert.ok(has(f, 'WARN', 'storage', 'photos'))
  assert.ok(has(f, 'WARN', 'functions', 'secret_fn'))
  assert.ok(has(f, 'FAIL', 'constraints', 'UNIQUE'))
})

// ---- RLS checks against an in-memory fake that behaves like Postgres RLS (or leaks on purpose)
interface FakeOpts { leakReads?: boolean; leakWrites?: boolean; allowForgedInsert?: boolean; enforceLinks?: boolean }
function makeFake(opts: FakeOpts) {
  const store: Record<string, Row[]> = {}
  const rows = (t: string) => (store[t] ??= [])
  const sessionOwner = (id: unknown) => rows('repair_sessions').find((r) => r.id === id)?.user_id
  const owner = (t: string, r: Row) => (t === 'repair_step_progress' ? sessionOwner(r.repair_session_id) : r.user_id)
  const visible = (uid: string | null, t: string, r: Row) => (opts.leakReads ? true : uid !== null && owner(t, r) === uid)
  const ownedBy = (t: string, id: unknown, uid: string) => rows(t).some((r) => r.id === id && r.user_id === uid)
  return (uid: string | null): DbApi => ({
    userId: uid,
    async insert(t, row) {
      if (uid === null) return { error: 'denied' }
      if (!opts.allowForgedInsert) {
        if (owner(t, row) !== uid) return { error: 'rls' }
        if (t === 'chat_messages' && sessionOwner(row.session_id) !== uid) return { error: 'rls' }
      }
      if (opts.enforceLinks) {
        if (t === 'repair_sessions') {
          if (row.appliance_id && !ownedBy('appliances', row.appliance_id, uid)) return { error: 'rls link' }
          if (row.diagnosis_id && !ownedBy('diagnoses', row.diagnosis_id, uid)) return { error: 'rls link' }
        }
        if (t === 'completed_repairs' && !ownedBy('diagnoses', row.diagnosis_id, uid)) return { error: 'rls link' }
      }
      rows(t).push({ ...row })
      return {}
    },
    async count(t, c, v) { return { rows: rows(t).filter((r) => r[c] === v && visible(uid, t, r)).length } },
    async update(t, c, v, patch) {
      const m = rows(t).filter((r) => r[c] === v && (opts.leakWrites || (uid !== null && owner(t, r) === uid)))
      m.forEach((r) => Object.assign(r, patch))
      return { affected: m.length }
    },
    async remove(t, c, v) {
      const m = rows(t).filter((r) => r[c] === v && (opts.leakWrites || (uid !== null && owner(t, r) === uid)))
      store[t] = rows(t).filter((r) => !m.includes(r))
      return { affected: m.length }
    },
  })
}
async function rls(opts: FakeOpts) {
  const api = makeFake(opts)
  let n = 0
  return runRlsChecks(api('user-A'), api('user-B'), api(null), () => `id-${(n += 1)}`)
}
const failed = (r: Awaited<ReturnType<typeof rls>>) => r.filter((x) => !x.pass)

await run('RLS checks: correctly protected database -> everything passes', async () => {
  const r = await rls({ enforceLinks: true })
  assert.deepEqual(failed(r), [])
  assert.ok(r.filter((x) => x.kind === 'ALLOW').length === 6, 'A can read own rows in all 6 tables')
})
await run('RLS checks: reads that leak are caught', async () => {
  const f = failed(await rls({ enforceLinks: true, leakReads: true }))
  assert.ok(f.some((x) => x.kind === 'DENY' && x.test.includes("B reads A's")))
  assert.ok(f.some((x) => x.test.includes("anon reads A's")))
})
await run('RLS checks: writes that leak are caught', async () => {
  const f = failed(await rls({ enforceLinks: true, leakWrites: true }))
  assert.ok(f.some((x) => x.test.includes("B updates A's")))
  assert.ok(f.some((x) => x.test.includes("B deletes A's")))
})
await run('RLS checks: forged inserts are caught', async () => {
  const f = failed(await rls({ enforceLinks: true, allowForgedInsert: true }))
  assert.ok(f.some((x) => x.test.includes('B inserts row owned by A')))
  assert.ok(f.some((x) => x.test.includes("B writes into A's session")))
})
await run('RLS checks: missing link-ownership policy shows as HARDENING gap', async () => {
  const f = failed(await rls({ enforceLinks: false }))
  assert.ok(f.length > 0 && f.every((x) => x.kind === 'HARDENING'))
})

await run('snapshot validation: incomplete exports are rejected, complete ones accepted', () => {
  const good = fixedSnapshot()
  const ok = validateSnapshot(good, Object.keys(expected.tables))
  assert.equal(ok.ok, true)
  // missing sections (what an old/edited/cut-off export looks like)
  const { indexes: __i, functions: __f, ...partial } = good
  void __i
  void __f
  const bad = validateSnapshot(partial, Object.keys(expected.tables))
  assert.equal(bad.ok, false)
  assert.ok(!bad.ok && bad.problems.some((p) => p.includes('"indexes"')) && bad.problems.some((p) => p.includes('"functions"')))
  // tables listed but nothing inside
  const hollow = validateSnapshot({ ...good, columns: [], rls: [] }, Object.keys(expected.tables))
  assert.equal(hollow.ok, false)
  assert.equal(validateSnapshot('nope').ok, false)
  assert.equal(validateSnapshot([]).ok, false)
  // a table in the snapshot with zero columns
  const oneEmpty = validateSnapshot({ ...good, columns: good.columns.filter((c) => c.table !== 'diagnoses') }, Object.keys(expected.tables))
  assert.ok(!oneEmpty.ok && oneEmpty.problems.some((p) => p.includes('diagnoses')))
})

console.log('\nAll S03 tests passed.')
