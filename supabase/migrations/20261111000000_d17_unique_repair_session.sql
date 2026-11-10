-- D17: prevent multiple repair sessions for the same user's diagnosis.
-- Full uniqueness applies regardless of repair-session status. This migration
-- does not alter or delete data; it stops if existing duplicates need review.
do $$
begin
  if exists (
    select 1
    from public.repair_sessions
    group by user_id, diagnosis_id
    having count(*) > 1
  ) then
    raise exception 'repair_sessions has duplicate (user_id, diagnosis_id) rows. Resolve them manually, then re-run.';
  end if;

  if not exists (
    select 1
    from pg_index i
    where i.indrelid = 'public.repair_sessions'::regclass
      and i.indisunique
      and i.indisvalid
      and i.indisready
      and i.indpred is null
      and i.indnatts = 2
      and (
        select array_agg(a.attname::text order by a.attname::text)
        from pg_attribute a
        where a.attrelid = i.indrelid
          and a.attnum = any (i.indkey)
      ) = array['diagnosis_id', 'user_id']
  ) then
    create unique index repair_sessions_user_diagnosis_key
      on public.repair_sessions (user_id, diagnosis_id);
  end if;
end $$;
