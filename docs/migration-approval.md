# Live migration approval record (S03)

A live (production) database change needs a separate, written approval. Fill this BEFORE applying anything to live.

| Field | Value |
|---|---|
| Migration file(s) | supabase/migrations/20261108010000_reconcile_schema.sql |
| Reviewed by (2nd person) | Swapnil Singh |
| Review date | 2026-11-08 |
| Findings file reviewed | docs/schema-comparison.md (generated from the live snapshot) |
| Backup taken (how + where) | Supabase Dashboard > Database > Backups (Manual snapshot created) |
| Tested first on (staging project) | project ref: `ohqsjvvvbpcmfrztchct` ; result: PASS |
| App flows tested on staging | login, photo -> diagnosis, guide step progress, complete repair, history, delete session ("Diagnosis and repair session saved successfully" verified) |
| RLS A/B test on staging | docs/rls-test-evidence.md : PASS |
| Approved by | Swapnil Singh |
| Applied to live on | *Pending (Will fill after running on live)* |
| Rollback plan | restore backup; migration only ADDS things (no data deleted) |
| Post-apply checks | re-run live audit + compare + RLS test; attach results |