-- S03: reconcile the repo schema with what the app code actually uses.
-- ADDITIVE + idempotent: no DROP TABLE, no DROP COLUMN, no DELETE of data. Safe to run on live and on a fresh project.
-- Review against docs/schema-comparison.md BEFORE applying to live (see docs/migration-approval.md).

-- 1) Tables that so far existed only in the live dashboard (no SQL in the repo)
create table if not exists public.appliances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  appliance_type text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  appliance_type text not null,
  issue_title text not null,
  diagnosis_result jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.completed_repairs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  diagnosis_id uuid not null references public.diagnoses (id) on delete cascade,
  repair_summary text,
  completed_at timestamptz not null default now(),
  feedback_rating integer
);

-- 2) repair_sessions: columns the code uses (two writers: Diagnosis.tsx and historyService.createSession)
alter table public.repair_sessions add column if not exists appliance_id uuid references public.appliances (id) on delete set null;
alter table public.repair_sessions add column if not exists diagnosis_id uuid references public.diagnoses (id) on delete set null;
alter table public.repair_sessions add column if not exists title text;
alter table public.repair_sessions add column if not exists description text;
alter table public.repair_sessions add column if not exists issue_name text;
alter table public.repair_sessions add column if not exists diagnosis jsonb;
alter table public.repair_sessions add column if not exists steps jsonb;
alter table public.repair_sessions add column if not exists current_step integer not null default 0;
alter table public.repair_sessions add column if not exists image_path text;
alter table public.repair_sessions add column if not exists completed_at timestamptz;

-- Diagnosis.tsx creates a session with only user_id, appliance_id, diagnosis_id, status.
-- NOT NULL on these three would make that insert fail, so relax them (data is preserved). Revisit in S06.
do $$
declare
  col text;
begin
  foreach col in array array['issue_name', 'diagnosis', 'steps'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'repair_sessions'
        and column_name = col and is_nullable = 'NO'
    ) then
      execute format('alter table public.repair_sessions alter column %I drop not null', col);
    end if;
  end loop;
end $$;

-- 3) Indexes for the lookups the app does
create index if not exists appliances_user_idx on public.appliances (user_id);
create index if not exists diagnoses_user_created_idx on public.diagnoses (user_id, created_at desc);
create index if not exists repair_sessions_user_diagnosis_idx on public.repair_sessions (user_id, diagnosis_id);

-- completed_repairs: the app relies on a unique (user_id, diagnosis_id) (it handles error 23505).
do $$
begin
  if exists (
    select 1 from public.completed_repairs group by user_id, diagnosis_id having count(*) > 1
  ) then
    raise exception 'completed_repairs has duplicate (user_id, diagnosis_id) rows. Resolve them manually, then re-run.';
  end if;

  if not exists (
    select 1 from pg_index i
    where i.indrelid = 'public.completed_repairs'::regclass
      and i.indisunique
      and (
        select array_agg(a.attname::text order by a.attname::text)
        from pg_attribute a
        where a.attrelid = i.indrelid and a.attnum = any (i.indkey)
      ) = array['diagnosis_id', 'user_id']
  ) then
    create unique index completed_repairs_user_diagnosis_key
      on public.completed_repairs (user_id, diagnosis_id);
  end if;
end $$;

-- 4) RLS + owner-only policies, created ONLY where the table has no policy for that command yet
--    (never adds a second, possibly looser, policy; never drops existing ones).
do $$
declare
  r record;
  c text;
  pol text;
begin
  for r in
    select * from (values
      ('appliances', array['select', 'insert', 'update']),
      ('diagnoses', array['select', 'insert']),
      ('completed_repairs', array['select', 'insert', 'update'])
    ) as v (tbl, cmds)
  loop
    execute format('alter table public.%I enable row level security', r.tbl);
    foreach c in array r.cmds loop
      if not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = r.tbl
          and (lower(p.cmd) = c or p.cmd = 'ALL')
      ) then
        pol := format('Users can %s own %s', c, replace(r.tbl, '_', ' '));
        if c = 'insert' then
          execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', pol, r.tbl);
        elsif c = 'update' then
          execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', pol, r.tbl);
        else
          execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', pol, r.tbl);
        end if;
      end if;
    end loop;
  end loop;
end $$;

-- 5) RESTRICTIVE policies: AND-ed with whatever permissive policies exist, so they tighten access
--    even if live has differently named/looser policies. They stop a user from linking rows to someone else's data.
drop policy if exists "Linked rows must be owned (insert)" on public.repair_sessions;
create policy "Linked rows must be owned (insert)" on public.repair_sessions
  as restrictive for insert to authenticated
  with check (
    (appliance_id is null or exists (
      select 1 from public.appliances a where a.id = appliance_id and a.user_id = (select auth.uid())))
    and (diagnosis_id is null or exists (
      select 1 from public.diagnoses d where d.id = diagnosis_id and d.user_id = (select auth.uid())))
  );

drop policy if exists "Linked rows must be owned (update)" on public.repair_sessions;
create policy "Linked rows must be owned (update)" on public.repair_sessions
  as restrictive for update to authenticated
  using (true)
  with check (
    (appliance_id is null or exists (
      select 1 from public.appliances a where a.id = appliance_id and a.user_id = (select auth.uid())))
    and (diagnosis_id is null or exists (
      select 1 from public.diagnoses d where d.id = diagnosis_id and d.user_id = (select auth.uid())))
  );

drop policy if exists "Diagnosis must be owned (insert)" on public.completed_repairs;
create policy "Diagnosis must be owned (insert)" on public.completed_repairs
  as restrictive for insert to authenticated
  with check (
    exists (select 1 from public.diagnoses d where d.id = diagnosis_id and d.user_id = (select auth.uid()))
  );

-- chat_messages: the original UPDATE policy did not check that the session belongs to the user.
drop policy if exists "Session must be owned (update)" on public.chat_messages;
create policy "Session must be owned (update)" on public.chat_messages
  as restrictive for update to authenticated
  using (true)
  with check (
    exists (select 1 from public.repair_sessions s where s.id = session_id and s.user_id = (select auth.uid()))
  );

-- 6) Grants: least privilege (RLS stays the main protection)
revoke all on table
  public.appliances, public.diagnoses, public.completed_repairs,
  public.repair_sessions, public.chat_messages, public.repair_step_progress
from anon;

revoke truncate, references, trigger on table
  public.appliances, public.diagnoses, public.completed_repairs,
  public.repair_sessions, public.chat_messages, public.repair_step_progress
from authenticated;

grant select, insert, update on table public.appliances to authenticated;
grant select, insert on table public.diagnoses to authenticated;
grant select, insert, update on table public.completed_repairs to authenticated;
grant select, insert, update, delete on table public.repair_sessions to authenticated;
grant select, insert, update, delete on table public.chat_messages to authenticated;
grant select, insert, update on table public.repair_step_progress to authenticated;
