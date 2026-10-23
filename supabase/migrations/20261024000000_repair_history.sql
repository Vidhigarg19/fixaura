create table if not exists public.repair_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  issue_name text not null,
  diagnosis jsonb not null,
  steps jsonb not null,
  current_step int not null default 0,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.repair_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists repair_sessions_user_updated_idx
  on public.repair_sessions (user_id, updated_at desc);
create index if not exists chat_messages_session_created_idx
  on public.chat_messages (session_id, created_at);

alter table public.repair_sessions enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Users can read their repair sessions" on public.repair_sessions;
drop policy if exists "Users can create their repair sessions" on public.repair_sessions;
drop policy if exists "Users can update their repair sessions" on public.repair_sessions;
drop policy if exists "Users can delete their repair sessions" on public.repair_sessions;
drop policy if exists "Users can read their repair messages" on public.chat_messages;
drop policy if exists "Users can create their repair messages" on public.chat_messages;
drop policy if exists "Users can update their repair messages" on public.chat_messages;
drop policy if exists "Users can delete their repair messages" on public.chat_messages;

create policy "Users can read their repair sessions"
  on public.repair_sessions for select
  using (user_id = (select auth.uid()));
create policy "Users can create their repair sessions"
  on public.repair_sessions for insert
  with check (user_id = (select auth.uid()));
create policy "Users can update their repair sessions"
  on public.repair_sessions for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users can delete their repair sessions"
  on public.repair_sessions for delete
  using (user_id = (select auth.uid()));

create policy "Users can read their repair messages"
  on public.chat_messages for select
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.repair_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );
create policy "Users can create their repair messages"
  on public.chat_messages for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.repair_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );
create policy "Users can update their repair messages"
  on public.chat_messages for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users can delete their repair messages"
  on public.chat_messages for delete
  using (user_id = (select auth.uid()));

create or replace function public.set_repair_session_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists repair_sessions_set_updated_at on public.repair_sessions;
create trigger repair_sessions_set_updated_at
  before update on public.repair_sessions
  for each row execute function public.set_repair_session_updated_at();
