alter table public.repair_sessions
  add column if not exists description text;
