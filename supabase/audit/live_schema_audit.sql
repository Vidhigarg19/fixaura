-- S03: READ-ONLY live schema audit. Only SELECTs - changes nothing.
-- Run in Supabase Dashboard > SQL Editor. Copy the single result cell into docs/schema/live-snapshot.json
with t(name) as (
  values ('repair_sessions'), ('chat_messages'), ('repair_step_progress'),
         ('diagnoses'), ('appliances'), ('completed_repairs'), ('analysis_usage')
)
select jsonb_pretty(jsonb_build_object(
  'generated_at', now(),

  'tables_present', (
    select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  ),

  'columns', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', c.table_name, 'column', c.column_name, 'type', c.data_type,
      'nullable', (c.is_nullable = 'YES'), 'default', c.column_default
    ) order by c.table_name, c.ordinal_position), '[]'::jsonb)
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name in (select name from t)
  ),

  'constraints', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', cl.relname, 'name', co.conname, 'type', co.contype::text,
      'definition', pg_get_constraintdef(co.oid)
    ) order by cl.relname, co.conname), '[]'::jsonb)
    from pg_constraint co
    join pg_class cl on cl.oid = co.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and cl.relname in (select name from t)
  ),

  'indexes', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', i.tablename, 'name', i.indexname, 'definition', i.indexdef
    ) order by i.tablename, i.indexname), '[]'::jsonb)
    from pg_indexes i
    where i.schemaname = 'public' and i.tablename in (select name from t)
  ),

  'rls', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', c.relname, 'enabled', c.relrowsecurity, 'forced', c.relforcerowsecurity
    ) order by c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname in (select name from t)
  ),

  'policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', p.tablename, 'name', p.policyname, 'permissive', p.permissive,
      'cmd', p.cmd, 'roles', to_jsonb(p.roles), 'using', p.qual, 'check', p.with_check
    ) order by p.tablename, p.policyname), '[]'::jsonb)
    from pg_policies p
    where p.schemaname = 'public' and p.tablename in (select name from t)
  ),

  'grants', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', g.table_name, 'grantee', g.grantee, 'privilege', g.privilege_type
    ) order by g.table_name, g.grantee, g.privilege_type), '[]'::jsonb)
    from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name in (select name from t)
      and g.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  ),

  'triggers', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', cl.relname, 'name', tg.tgname, 'definition', pg_get_triggerdef(tg.oid)
    ) order by cl.relname, tg.tgname), '[]'::jsonb)
    from pg_trigger tg
    join pg_class cl on cl.oid = tg.tgrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and not tg.tgisinternal
  ),

  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', p.proname, 'args', pg_get_function_identity_arguments(p.oid),
      'security_definer', p.prosecdef, 'acl', p.proacl::text
    ) order by p.proname), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  ),

  'storage_buckets', (
    select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'public', b.public) order by b.id), '[]'::jsonb)
    from storage.buckets b
  )
));
