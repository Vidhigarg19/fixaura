-- S02: usage limits for the analyze-image Edge Function (additive: 1 table + 2 functions).
-- Safe to run more than once. Only the service role (Edge Function) can call it.

create table if not exists public.analysis_usage (
  bucket text primary key,
  used integer not null default 0 check (used >= 0),
  created_at timestamptz not null default now()
);

create index if not exists analysis_usage_created_at_idx
  on public.analysis_usage (created_at);

alter table public.analysis_usage enable row level security;
-- No RLS policies on purpose: anon/authenticated users can never read or write this table.
revoke all on table public.analysis_usage from anon, authenticated;
grant all on table public.analysis_usage to service_role;

-- Internal helper: +1 to a bucket only if it is still below the limit.
create or replace function public._bump_analysis_usage(p_bucket text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if p_limit is null or p_limit < 1 then
    return false;
  end if;

  insert into public.analysis_usage as u (bucket, used)
  values (p_bucket, 1)
  on conflict (bucket) do update
    set used = u.used + 1
    where u.used < p_limit
  returning u.used into v_used;

  return v_used is not null;
end;
$$;

-- Returns: 'ok' | 'user_minute' | 'user_day' | 'global_day'
-- All-or-nothing: if any limit is hit, earlier increments in this call are rolled back.
create or replace function public.consume_analysis_quota(
  p_user text,
  p_minute_limit integer,
  p_user_day_limit integer,
  p_global_day_limit integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamp := (now() at time zone 'utc');
  v_minute text := 'min:' || to_char(v_now, 'YYYY-MM-DD"T"HH24:MI') || ':user:' || p_user;
  v_user_day text := 'day:' || to_char(v_now, 'YYYY-MM-DD') || ':user:' || p_user;
  v_global_day text := 'day:' || to_char(v_now, 'YYYY-MM-DD') || ':global';
begin
  delete from public.analysis_usage where created_at < now() - interval '3 days';

  begin
    if not public._bump_analysis_usage(v_minute, p_minute_limit) then
      raise exception 'user_minute';
    end if;
    if not public._bump_analysis_usage(v_user_day, p_user_day_limit) then
      raise exception 'user_day';
    end if;
    if not public._bump_analysis_usage(v_global_day, p_global_day_limit) then
      raise exception 'global_day';
    end if;
  exception
    when raise_exception then
      return sqlerrm;
  end;

  return 'ok';
end;
$$;

revoke all on function public._bump_analysis_usage(text, integer) from public, anon, authenticated;
revoke all on function public.consume_analysis_quota(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_analysis_quota(text, integer, integer, integer) to service_role;
