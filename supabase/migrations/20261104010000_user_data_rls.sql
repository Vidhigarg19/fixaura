do $$
begin
  if to_regclass('public.appliances') is null
    or to_regclass('public.diagnoses') is null
    or to_regclass('public.completed_repairs') is null
  then
    raise exception
      'Expected user-data tables are missing: public.appliances, public.diagnoses, and public.completed_repairs must exist before applying user-data RLS policies.';
  end if;
end;
$$;

alter table public.appliances enable row level security;
alter table public.diagnoses enable row level security;
alter table public.completed_repairs enable row level security;

drop policy if exists "Users can read their appliances" on public.appliances;
drop policy if exists "Users can create their appliances" on public.appliances;
drop policy if exists "Users can update their appliances" on public.appliances;
drop policy if exists "Users can delete their appliances" on public.appliances;

create policy "Users can read their appliances"
  on public.appliances for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users can create their appliances"
  on public.appliances for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users can update their appliances"
  on public.appliances for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users can delete their appliances"
  on public.appliances for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can read their diagnoses" on public.diagnoses;
drop policy if exists "Users can create their diagnoses" on public.diagnoses;
drop policy if exists "Users can update their diagnoses" on public.diagnoses;
drop policy if exists "Users can delete their diagnoses" on public.diagnoses;

create policy "Users can read their diagnoses"
  on public.diagnoses for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users can create their diagnoses"
  on public.diagnoses for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users can update their diagnoses"
  on public.diagnoses for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users can delete their diagnoses"
  on public.diagnoses for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can read their completed repairs" on public.completed_repairs;
drop policy if exists "Users can create their completed repairs" on public.completed_repairs;
drop policy if exists "Users can update their completed repairs" on public.completed_repairs;
drop policy if exists "Users can delete their completed repairs" on public.completed_repairs;

create policy "Users can read their completed repairs"
  on public.completed_repairs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users can create their completed repairs"
  on public.completed_repairs for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.diagnoses d
      where d.id = diagnosis_id and d.user_id = (select auth.uid())
    )
  );
create policy "Users can update their completed repairs"
  on public.completed_repairs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.diagnoses d
      where d.id = diagnosis_id and d.user_id = (select auth.uid())
    )
  );
create policy "Users can delete their completed repairs"
  on public.completed_repairs for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can update their repair messages" on public.chat_messages;
create policy "Users can update their repair messages"
  on public.chat_messages for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.repair_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.repair_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );
