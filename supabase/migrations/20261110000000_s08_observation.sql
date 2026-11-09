-- S08: Truthful before/after observation.
-- Persist the observation result (status + limitations + warnings) on the
-- authoritative repair session row. ADDITIVE + idempotent: no DROP, no DELETE.
--
-- Shape (matches src/types/repair.ts ObservationResult):
--   {
--     status: 'visible_change' | 'no_clear_change' | 'incomparable'
--           | 'insufficient_evidence' | 'professional_review',
--     summary: string,
--     limitations: string[],
--     warnings: string[],
--     nextAdvice: string,
--     safetyOverride: boolean,
--     policyVersion: string,
--     observedAt: string (ISO)
--   }
-- Deliberately has no "resolved"/"safe" state: an observation never certifies
-- safety. Written by src/services/repairSessionDb.ts persistObservation(), read
-- back on rehydration. RLS on repair_sessions already scopes this to the owner
-- (user_id = auth.uid()); no new policy is required (same row).

alter table public.repair_sessions
  add column if not exists observation jsonb;

comment on column public.repair_sessions.observation is
  'S08 truthful before/after observation result. No safety certification. User-owned via existing RLS.';
