// S03 pure logic (no network, no Node APIs) so it can be tested.

// ---------------------------------------------------------------- schema comparison
export interface Snapshot {
  tables_present: string[]
  columns: { table: string; column: string; type: string; nullable: boolean; default: string | null }[]
  constraints: { table: string; name: string; type: string; definition: string }[]
  indexes: { table: string; name: string; definition: string }[]
  rls: { table: string; enabled: boolean; forced: boolean }[]
  policies: { table: string; name: string; permissive: string; cmd: string; roles: string[]; using: string | null; check: string | null }[]
  grants: { table: string; grantee: string; privilege: string }[]
  functions: { name: string; args: string; security_definer: boolean; acl: string | null }[]
  storage_buckets: { id: string; public: boolean }[]
}

export interface ExpectedTable {
  columns: Record<string, string | null>
  operations: ('select' | 'insert' | 'update' | 'delete')[]
  inserts?: { source: string; columns: string[] }[]
  uniqueOn?: string[]
}
export interface Expected {
  tables: Record<string, ExpectedTable>
  linkOwnership?: { table: string; cmd: string; mustMention: string[] }[]
}

export type Status = 'FAIL' | 'WARN' | 'INFO' | 'OK'
export interface Finding { status: Status; area: string; table: string; finding: string; action: string }

const PRIV: Record<string, string> = { select: 'SELECT', insert: 'INSERT', update: 'UPDATE', delete: 'DELETE' }

export function compareSchema(
  snap: Snapshot,
  expected: Expected,
  migrations: { name: string; sql: string }[]
): Finding[] {
  const out: Finding[] = []
  const add = (status: Status, area: string, table: string, finding: string, action: string) =>
    out.push({ status, area, table, finding, action })
  const mig = [...migrations].sort((a, b) => a.name.localeCompare(b.name))

  for (const [table, exp] of Object.entries(expected.tables)) {
    // --- local SQL coverage (fresh environment must be able to recreate the table)
    const hasDdl = mig.some((m) => new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?(public\\.)?${table}\\b`, 'i').test(m.sql))
    if (!hasDdl) {
      add('FAIL', 'migrations', table, 'Table is used by the app but no CREATE TABLE exists in supabase/migrations.',
        'Add it to a reviewed migration (see 20261108010000_reconcile_schema.sql).')
    }

    if (!snap.tables_present.includes(table)) {
      add('FAIL', 'live schema', table, 'Table does not exist in the live database.', 'Apply the reconcile migration (after review).')
      continue
    }
    const liveCols = snap.columns.filter((c) => c.table === table)
    const colMap = new Map(liveCols.map((c) => [c.column, c]))

    for (const [col, type] of Object.entries(exp.columns)) {
      const live = colMap.get(col)
      if (!live) add('FAIL', 'columns', table, `Column "${col}" is used by the code but missing in live.`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ${col}.`)
      else if (type && live.type !== type) add('WARN', 'columns', table, `Column "${col}" is ${live.type} in live, code expects ${type}.`, 'Check the code and data before changing the type.')
    }

    for (const ins of exp.inserts ?? []) {
      const blockers = liveCols.filter((c) => !c.nullable && c.default === null && !ins.columns.includes(c.column))
      if (blockers.length) {
        add('FAIL', 'insert shape', table,
          `Insert from ${ins.source} will fail: NOT NULL without default and not provided: ${blockers.map((b) => b.column).join(', ')}.`,
          'Relax NOT NULL (data preserved) or change the code to supply the value.')
      }
    }

    const rls = snap.rls.find((r) => r.table === table)
    if (!rls?.enabled) {
      add('FAIL', 'RLS', table, 'Row Level Security is OFF.', 'ALTER TABLE ... ENABLE ROW LEVEL SECURITY and add owner policies.')
    }

    const pols = snap.policies.filter((p) => p.table === table)
    for (const op of exp.operations) {
      const ok = pols.some(
        (p) => p.permissive.toUpperCase() !== 'RESTRICTIVE' && (p.cmd.toUpperCase() === op.toUpperCase() || p.cmd.toUpperCase() === 'ALL') &&
          (p.roles.includes('authenticated') || p.roles.includes('public'))
      )
      if (!ok) add('FAIL', 'policies', table, `No policy allows ${op.toUpperCase()} for logged-in users, but the app does it.`, 'Add an owner-only policy for that command.')
    }
    for (const p of pols) {
      const text = `${p.using ?? ''} ${p.check ?? ''}`
      const isPermissive = p.permissive.toUpperCase() !== 'RESTRICTIVE'
      if (isPermissive && (p.using === 'true' || (p.using === null && p.check === 'true'))) {
        add('FAIL', 'policies', table, `Policy "${p.name}" (${p.cmd}) allows everything (true).`, 'Replace with an owner-only check (user_id = auth.uid()).')
      } else if (isPermissive && !/auth\.uid|uid\(\)/.test(text)) {
        add('WARN', 'policies', table, `Policy "${p.name}" (${p.cmd}) does not reference auth.uid().`, 'Review manually: is it really owner-only?')
      }
      if (isPermissive && (p.roles.includes('anon') || p.roles.includes('public')) && !/auth\.uid|uid\(\)/.test(text)) {
        add('WARN', 'policies', table, `Policy "${p.name}" applies to anon/public and has no owner check.`, 'Restrict to authenticated users.')
      }
    }

    const grants = snap.grants.filter((g) => g.table === table)
    const anonPrivs = grants.filter((g) => g.grantee === 'anon').map((g) => g.privilege)
    if (anonPrivs.length) add('WARN', 'grants', table, `anon has privileges: ${anonPrivs.join(', ')}.`, 'REVOKE ALL ... FROM anon (RLS still protects, but remove the exposure).')
    const authPrivs = grants.filter((g) => g.grantee === 'authenticated').map((g) => g.privilege)
    const risky = authPrivs.filter((p) => ['TRUNCATE', 'REFERENCES', 'TRIGGER'].includes(p))
    if (risky.length) add('WARN', 'grants', table, `authenticated has ${risky.join(', ')}.`, 'REVOKE those privileges from authenticated.')
    for (const op of exp.operations) {
      if (!authPrivs.includes(PRIV[op])) add('FAIL', 'grants', table, `authenticated lacks ${PRIV[op]} but the app needs it.`, `GRANT ${PRIV[op]} ... TO authenticated.`)
    }

    if (exp.uniqueOn) {
      const want = exp.uniqueOn.join(',')
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
      const hit =
        snap.constraints.some((c) => c.table === table && ['u', 'p'].includes(c.type) && norm(c.definition).includes(`(${want})`)) ||
        snap.indexes.some((i) => i.table === table && norm(i.definition).includes('uniqueindex') && norm(i.definition).includes(`(${want})`))
      if (!hit) add('FAIL', 'constraints', table, `No UNIQUE on (${want}); the code relies on it to avoid duplicates.`, 'Resolve duplicates, then create the unique index.')
    }
  }

  for (const rule of expected.linkOwnership ?? []) {
    if (!snap.tables_present.includes(rule.table)) continue
    const pols = snap.policies.filter((p) => p.table === rule.table && (p.cmd.toUpperCase() === rule.cmd.toUpperCase() || p.cmd.toUpperCase() === 'ALL'))
    const text = pols.map((p) => `${p.using ?? ''} ${p.check ?? ''}`).join(' ').toLowerCase()
    const missing = rule.mustMention.filter((m) => !text.includes(m))
    if (missing.length) {
      add('WARN', 'link ownership', rule.table, `${rule.cmd.toUpperCase()} policies do not verify ownership of linked rows (${missing.join(', ')}).`,
        'Add a RESTRICTIVE policy (see reconcile migration).')
    }
  }

  // --- migration order: a table must exist before another migration references it
  const created = new Set<string>()
  for (const m of mig) {
    const mine = [...m.sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/gi)].map((x) => x[1].toLowerCase())
    for (const ref of m.sql.matchAll(/references\s+public\.(\w+)/gi)) {
      const r = ref[1].toLowerCase()
      if (!created.has(r) && !mine.includes(r)) {
        add('FAIL', 'migration order', r, `${m.name} references public.${r} before any earlier migration creates it (a fresh environment will fail).`, 'Rename the file to a later version so it runs after the table is created.')
      }
    }
    mine.forEach((t) => created.add(t))
  }

  for (const b of snap.storage_buckets) {
    if (b.public) add('WARN', 'storage', b.id, 'Storage bucket is PUBLIC.', 'Use a private bucket for user photos (S09).')
  }
  for (const f of snap.functions) {
    if (f.security_definer && (f.acl === null || /(^|[{,])=X\//.test(f.acl))) {
      add('WARN', 'functions', f.name, 'SECURITY DEFINER function is executable by PUBLIC/anon.', 'REVOKE EXECUTE ... FROM public, anon, authenticated.')
    }
  }
  const known = new Set([...Object.keys(expected.tables), 'analysis_usage'])
  const extra = snap.tables_present.filter((t) => !known.has(t))
  if (extra.length) add('INFO', 'live schema', extra.join(', '), 'Live tables not used by the code (not audited here).', 'Check whether they are still needed and have RLS.')

  if (!out.some((f) => f.status === 'FAIL' || f.status === 'WARN')) add('OK', 'summary', '-', 'No mismatches found.', '-')
  return out
}

export function renderComparison(findings: Finding[]): string {
  const count = (s: Status) => findings.filter((f) => f.status === s).length
  const esc = (v: string) => v.replace(/\|/g, '/')
  return `# Schema comparison (repo vs live)

Generated: ${new Date().toISOString()}

FAIL: ${count('FAIL')} | WARN: ${count('WARN')} | INFO: ${count('INFO')}

| Status | Area | Table | Finding | Suggested action |
|---|---|---|---|---|
${findings.map((f) => `| ${f.status} | ${f.area} | ${esc(f.table)} | ${esc(f.finding)} | ${esc(f.action)} |`).join('\n')}
`
}

// ---------------------------------------------------------------- snapshot validation
// compareSchema ko incomplete snapshot kabhi mat do: missing sections "empty" maan lene se
// jhoothe FAIL aate hain (aur asli problem chhup jaati hai). Isliye pehle structure verify hota hai.
const REQUIRED_KEYS = ['tables_present', 'columns', 'constraints', 'indexes', 'rls', 'policies', 'grants', 'functions', 'storage_buckets'] as const

export type SnapshotCheck = { ok: true; snapshot: Snapshot; summary: string } | { ok: false; problems: string[] }

export function validateSnapshot(raw: unknown, expectedTables: string[] = []): SnapshotCheck {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, problems: ['Snapshot is not a JSON object.'] }
  const obj = raw as Record<string, unknown>
  const problems: string[] = []
  for (const key of REQUIRED_KEYS) {
    if (!Array.isArray(obj[key])) problems.push(`Section "${key}" is missing (or not a list).`)
  }
  if (problems.length) return { ok: false, problems }

  const snap = obj as unknown as Snapshot
  if (snap.tables_present.length > 0 && snap.columns.length === 0) problems.push('Tables are listed but "columns" is empty: the export is incomplete.')
  if (snap.tables_present.length > 0 && snap.rls.length === 0) problems.push('Tables are listed but "rls" is empty: the export is incomplete.')
  for (const t of expectedTables) {
    if (snap.tables_present.includes(t) && !snap.columns.some((c) => c.table === t)) problems.push(`Table "${t}" exists but has no columns in the snapshot.`)
  }
  if (problems.length) return { ok: false, problems }

  const n = (k: (typeof REQUIRED_KEYS)[number]) => (snap[k] as unknown[]).length
  return { ok: true, snapshot: snap, summary: REQUIRED_KEYS.map((k) => `${k}=${n(k)}`).join(', ') }
}

// ---------------------------------------------------------------- RLS account A/B checks
export type Row = Record<string, unknown>
export interface DbApi {
  userId: string | null
  insert(table: string, row: Row): Promise<{ error?: string }>
  count(table: string, column: string, value: string): Promise<{ rows: number; error?: string }>
  update(table: string, column: string, value: string, patch: Row): Promise<{ affected: number; error?: string }>
  remove(table: string, column: string, value: string): Promise<{ affected: number; error?: string }>
}
export interface RlsResult { kind: 'ALLOW' | 'DENY' | 'HARDENING' | 'SETUP'; test: string; expected: string; actual: string; pass: boolean }

const KEY: Record<string, string> = {
  appliances: 'id', diagnoses: 'id', repair_sessions: 'id', chat_messages: 'id', completed_repairs: 'id', repair_step_progress: 'repair_session_id',
}
const TABLES = Object.keys(KEY)

export async function runRlsChecks(a: DbApi, b: DbApi, anon: DbApi, newId: () => string): Promise<RlsResult[]> {
  const res: RlsResult[] = []
  const rec = (kind: RlsResult['kind'], test: string, expected: string, actual: string, pass: boolean) =>
    res.push({ kind, test, expected, actual, pass })
  const A = a.userId as string
  const B = b.userId as string
  const ids: Record<string, string> = {
    appliances: newId(), diagnoses: newId(), repair_sessions: newId(), chat_messages: newId(), completed_repairs: newId(),
  }
  ids.repair_step_progress = ids.repair_sessions

  // ---- seed (as A) - same shapes the app uses
  const seed: [string, Row][] = [
    ['appliances', { id: ids.appliances, user_id: A, name: 'S03-RLS-TEST', appliance_type: 'S03-RLS-TEST' }],
    ['diagnoses', { id: ids.diagnoses, user_id: A, appliance_type: 'S03-RLS-TEST', issue_title: 'S03-RLS-TEST', diagnosis_result: { test: true } }],
  ]
  for (const [t, row] of seed) {
    const r = await a.insert(t, row)
    rec('SETUP', `A creates ${t}`, 'allowed', r.error ?? 'ok', !r.error)
  }
  const sessionApp: Row = { id: ids.repair_sessions, user_id: A, appliance_id: ids.appliances, diagnosis_id: ids.diagnoses, status: 'in_progress' }
  let s = await a.insert('repair_sessions', sessionApp)
  if (s.error) {
    rec('SETUP', 'A creates repair_sessions (Diagnosis.tsx shape)', 'allowed', s.error, false)
    s = await a.insert('repair_sessions', { ...sessionApp, title: 'S03-RLS-TEST', description: 'x', issue_name: 'S03-RLS-TEST', diagnosis: {}, steps: [], current_step: 0 })
    rec('SETUP', 'A creates repair_sessions (legacy shape)', 'allowed', s.error ?? 'ok', !s.error)
  } else {
    rec('SETUP', 'A creates repair_sessions (Diagnosis.tsx shape)', 'allowed', 'ok', true)
  }
  const seeds2: [string, Row][] = [
    ['repair_step_progress', { repair_session_id: ids.repair_sessions, step_id: 's03', status: 'in_progress' }],
    ['chat_messages', { id: ids.chat_messages, session_id: ids.repair_sessions, user_id: A, role: 'user', content: 'S03-RLS-TEST' }],
    ['completed_repairs', { id: ids.completed_repairs, user_id: A, diagnosis_id: ids.diagnoses, repair_summary: 'S03-RLS-TEST' }],
  ]
  for (const [t, row] of seeds2) {
    const r = await a.insert(t, row)
    rec('SETUP', `A creates ${t}`, 'allowed', r.error ?? 'ok', !r.error)
  }
  if (res.some((r) => r.kind === 'SETUP' && !r.pass && !r.test.includes('Diagnosis.tsx shape'))) return res

  // ---- ALLOW: A reads own rows
  for (const t of TABLES) {
    const r = await a.count(t, KEY[t], ids[t])
    rec('ALLOW', `A reads own ${t}`, '>= 1 row', r.error ?? `${r.rows} row(s)`, !r.error && r.rows >= 1)
  }
  // ---- DENY: B and anon cannot read A's rows
  for (const [who, api] of [['B', b], ['anon', anon]] as const) {
    for (const t of TABLES) {
      const r = await api.count(t, KEY[t], ids[t])
      rec('DENY', `${who} reads A's ${t}`, '0 rows or error', r.error ? `error (blocked)` : `${r.rows} row(s)`, !!r.error || r.rows === 0)
    }
  }
  // ---- DENY: B cannot update A's rows (patches keep the same values)
  const patches: Record<string, Row> = {
    appliances: { name: 'S03-RLS-TEST' }, diagnoses: { issue_title: 'S03-RLS-TEST' }, repair_sessions: { status: 'in_progress' },
    repair_step_progress: { status: 'in_progress' }, chat_messages: { content: 'S03-RLS-TEST' }, completed_repairs: { repair_summary: 'S03-RLS-TEST' },
  }
  for (const t of TABLES) {
    const r = await b.update(t, KEY[t], ids[t], patches[t])
    rec('DENY', `B updates A's ${t}`, '0 rows or error', r.error ? 'error (blocked)' : `${r.affected} row(s) changed`, !!r.error || r.affected === 0)
  }
  // ---- DENY: B cannot insert rows that belong to A
  const forged: [string, Row][] = [
    ['appliances', { id: newId(), user_id: A, name: 'forged', appliance_type: 'forged' }],
    ['diagnoses', { id: newId(), user_id: A, appliance_type: 'forged', issue_title: 'forged', diagnosis_result: {} }],
    ['repair_sessions', { id: newId(), user_id: A, status: 'in_progress' }],
    ['chat_messages', { id: newId(), session_id: ids.repair_sessions, user_id: A, role: 'user', content: 'forged' }],
    ['chat_messages', { id: newId(), session_id: ids.repair_sessions, user_id: B, role: 'user', content: 'forged into A session' }],
    ['repair_step_progress', { repair_session_id: ids.repair_sessions, step_id: 'forged', status: 'completed' }],
    ['completed_repairs', { id: newId(), user_id: A, diagnosis_id: ids.diagnoses, repair_summary: 'forged' }],
  ]
  for (const [t, row] of forged) {
    const r = await b.insert(t, row)
    const label = row.user_id === B ? 'B writes into A\'s session as B' : 'B inserts row owned by A'
    rec('DENY', `${label}: ${t}`, 'error (blocked)', r.error ? 'error (blocked)' : 'INSERT SUCCEEDED', !!r.error)
    if (!r.error) await b.remove(t, KEY[t], String(row[KEY[t]] ?? ids.repair_sessions))
  }
  // ---- HARDENING: B links B's own rows to A's data
  const links: [string, Row][] = [
    ['repair_sessions', { id: newId(), user_id: B, diagnosis_id: ids.diagnoses, status: 'in_progress' }],
    ['repair_sessions', { id: newId(), user_id: B, appliance_id: ids.appliances, status: 'in_progress' }],
    ['completed_repairs', { id: newId(), user_id: B, diagnosis_id: ids.diagnoses, repair_summary: 'link to A diagnosis' }],
  ]
  for (const [t, row] of links) {
    const r = await b.insert(t, row)
    rec('HARDENING', `B links own ${t} row to A's data`, 'error (blocked)', r.error ? 'error (blocked)' : 'ALLOWED (cross-user link)', !!r.error)
    if (!r.error) await b.remove(t, KEY[t], String(row.id))
  }
  // ---- DENY: B cannot delete A's rows (last, in case something leaks)
  for (const t of TABLES) {
    const r = await b.remove(t, KEY[t], ids[t])
    rec('DENY', `B deletes A's ${t}`, '0 rows or error', r.error ? 'error (blocked)' : `${r.affected} row(s) deleted`, !!r.error || r.affected === 0)
  }
  // ---- cleanup as A (cascade removes progress + messages)
  await a.remove('repair_sessions', 'id', ids.repair_sessions)
  return res
}

export function renderRls(results: RlsResult[]): string {
  const bad = results.filter((r) => !r.pass)
  const failCore = bad.filter((r) => r.kind !== 'HARDENING')
  const warn = bad.filter((r) => r.kind === 'HARDENING')
  return `# RLS evidence: account A vs account B

Generated: ${new Date().toISOString()}

Result: ${failCore.length === 0 ? 'PASS (no cross-user access found)' : `FAIL (${failCore.length} problem(s))`}${warn.length ? ` | HARDENING gaps: ${warn.length}` : ''}

| Kind | Test | Expected | Actual | Pass |
|---|---|---|---|---|
${results.map((r) => `| ${r.kind} | ${r.test.replace(/\|/g, '/')} | ${r.expected} | ${r.actual.replace(/\|/g, '/')} | ${r.pass ? 'PASS' : 'FAIL'} |`).join('\n')}

Test data is marked S03-RLS-TEST and belongs to dedicated test accounts only.
`
}
