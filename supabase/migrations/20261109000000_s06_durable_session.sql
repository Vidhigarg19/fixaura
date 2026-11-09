-- S06: Durable Repair Session and Progress.
-- Makes repair_sessions the single source of truth for an active repair.
-- ADDITIVE + idempotent: no DROP TABLE/COLUMN, no DELETE, no data loss.
-- Safe to run on live and on a fresh project.
--
-- Context: before S06 the app wrote TWO repair_sessions rows per repair
--   (one from Diagnosis.tsx with only the appliance/diagnosis links, one from
--    historyService.createSession with diagnosis/steps/current_step).
-- From S06 the app writes ONE row that carries both the links AND the full
--   diagnosis/steps/current_step payload, and re-fetches it on reload.
-- We intentionally do NOT re-add the NOT NULL constraints that
--   20261108010000_reconcile_schema.sql relaxed: the app now always supplies
--   issue_name/diagnosis/steps on insert, but keeping the columns nullable
--   avoids breaking any legacy/guest row and keeps this migration non-breaking.

-- 1) Index supporting "the user's latest active session" lookup used by
--    src/services/repairSessionDb.ts getActiveRepairSession():
--      where user_id = ? and status = 'in_progress' order by updated_at desc
create index if not exists repair_sessions_user_status_updated_idx
  on public.repair_sessions (user_id, status, updated_at desc);

-- 2) Backfill helper fields for any pre-S06 "link only" rows that are still
--    in_progress, so they rehydrate instead of being treated as unusable.
--    Only fills columns that are currently NULL; never overwrites real data,
--    never touches completed rows. current_step already defaults to 0.
update public.repair_sessions rs
set
  issue_name = coalesce(rs.issue_name, d.issue_title),
  title = coalesce(rs.title, d.issue_title),
  diagnosis = coalesce(rs.diagnosis, d.diagnosis_result)
from public.diagnoses d
where rs.diagnosis_id = d.id
  and rs.status = 'in_progress'
  and (rs.issue_name is null or rs.diagnosis is null or rs.title is null);
