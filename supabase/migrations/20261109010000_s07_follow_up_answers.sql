-- S07: Follow-up question loop and guide payload.
-- Persist the user's follow-up symptom answers on the authoritative repair
-- session row. ADDITIVE + idempotent: no DROP, no DELETE, safe on live.
--
-- Shape: a JSON object keyed by question id. Values are either a string
--   (yes_no / single_choice / short_text) or an array of strings (multi_choice),
--   matching src/utils/followUpValidation.ts FollowUpAnswers.
-- Written by src/services/repairSessionDb.ts persistSymptomAnswers(), read back
--   on rehydration. RLS on repair_sessions already scopes this to the owner
--   (user_id = auth.uid()); no new policy is required because it is the same row.

alter table public.repair_sessions
  add column if not exists symptom_answers jsonb;

comment on column public.repair_sessions.symptom_answers is
  'S07 follow-up answers: { [questionId]: string | string[] }. User-owned via existing RLS.';
