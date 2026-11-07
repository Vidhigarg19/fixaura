# S03 findings from the repo alone (before looking at live)

| # | Severity | Finding | Where | Fix in this task |
|---|---|---|---|---|
| 1 | FAIL | Migration order bug: repair_step_progress (20261022090000) references repair_sessions, which is created later (20261024000000). A fresh environment fails at the first migration. | supabase/migrations | Renamed to 20261024000100_create_repair_step_progress.sql |
| 2 | FAIL | `appliances`, `diagnoses`, `completed_repairs` are used by the app but have NO SQL in the repo (they exist only in the live dashboard). | src/Pages/Diagnosis.tsx, completedRepair.ts, DiagnosisHistory.tsx | 20261108010000_reconcile_schema.sql |
| 3 | FAIL | `repair_sessions.appliance_id` and `.diagnosis_id` are used by the code but not defined in SQL. | Diagnosis.tsx, completedRepair.ts | same migration |
| 4 | FAIL | repo SQL has issue_name / diagnosis / steps NOT NULL, but Diagnosis.tsx inserts a session without them (insert would fail against the repo SQL). Two writers use the table with different shapes. | repair_history.sql vs Diagnosis.tsx | NOT NULL relaxed (data kept); decide final shape in S06 |
| 5 | WARN | completed_repairs: code relies on unique (user_id, diagnosis_id) (handles error 23505) but no SQL defines it. | completedRepair.ts | unique index (guarded: stops if duplicates exist) |
| 6 | WARN | chat_messages UPDATE policy does not check that the session belongs to the user. | repair_history.sql | restrictive policy "Session must be owned (update)" |
| 7 | WARN | Nothing stops a user linking their own row to another user's appliance/diagnosis (FK checks bypass RLS). | repair_sessions, completed_repairs | restrictive "owned" policies |
| 8 | WARN | No explicit GRANT/REVOKE for most tables; default Supabase grants give anon and authenticated broad rights (incl. TRUNCATE). | all | revoke anon; least privilege for authenticated |
| 9 | INFO | Two Supabase client files (src/lib/supabase.ts and src/services/supabase.ts). | src | S04 |
| 10 | INFO | Photos are not stored in Storage yet (image_path column exists, unused). | historyService.ts | S09 |
