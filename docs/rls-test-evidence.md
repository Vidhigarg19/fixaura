# RLS evidence: account A vs account B

Generated: 2026-11-07T18:20:20.189Z

Result: PASS (no cross-user access found)

| Kind | Test | Expected | Actual | Pass |
|---|---|---|---|---|
| SETUP | A creates appliances | allowed | ok | PASS |
| SETUP | A creates diagnoses | allowed | ok | PASS |
| SETUP | A creates repair_sessions (Diagnosis.tsx shape) | allowed | ok | PASS |
| SETUP | A creates repair_step_progress | allowed | ok | PASS |
| SETUP | A creates chat_messages | allowed | ok | PASS |
| SETUP | A creates completed_repairs | allowed | ok | PASS |
| ALLOW | A reads own appliances | >= 1 row | 1 row(s) | PASS |
| ALLOW | A reads own diagnoses | >= 1 row | 1 row(s) | PASS |
| ALLOW | A reads own repair_sessions | >= 1 row | 1 row(s) | PASS |
| ALLOW | A reads own chat_messages | >= 1 row | 1 row(s) | PASS |
| ALLOW | A reads own completed_repairs | >= 1 row | 1 row(s) | PASS |
| ALLOW | A reads own repair_step_progress | >= 1 row | 1 row(s) | PASS |
| DENY | B reads A's appliances | 0 rows or error | 0 row(s) | PASS |
| DENY | B reads A's diagnoses | 0 rows or error | 0 row(s) | PASS |
| DENY | B reads A's repair_sessions | 0 rows or error | 0 row(s) | PASS |
| DENY | B reads A's chat_messages | 0 rows or error | 0 row(s) | PASS |
| DENY | B reads A's completed_repairs | 0 rows or error | 0 row(s) | PASS |
| DENY | B reads A's repair_step_progress | 0 rows or error | 0 row(s) | PASS |
| DENY | anon reads A's appliances | 0 rows or error | 0 row(s) | PASS |
| DENY | anon reads A's diagnoses | 0 rows or error | 0 row(s) | PASS |
| DENY | anon reads A's repair_sessions | 0 rows or error | 0 row(s) | PASS |
| DENY | anon reads A's chat_messages | 0 rows or error | 0 row(s) | PASS |
| DENY | anon reads A's completed_repairs | 0 rows or error | 0 row(s) | PASS |
| DENY | anon reads A's repair_step_progress | 0 rows or error | 0 row(s) | PASS |
| DENY | B updates A's appliances | 0 rows or error | 0 row(s) changed | PASS |
| DENY | B updates A's diagnoses | 0 rows or error | error (blocked) | PASS |
| DENY | B updates A's repair_sessions | 0 rows or error | 0 row(s) changed | PASS |
| DENY | B updates A's chat_messages | 0 rows or error | 0 row(s) changed | PASS |
| DENY | B updates A's completed_repairs | 0 rows or error | 0 row(s) changed | PASS |
| DENY | B updates A's repair_step_progress | 0 rows or error | 0 row(s) changed | PASS |
| DENY | B inserts row owned by A: appliances | error (blocked) | error (blocked) | PASS |
| DENY | B inserts row owned by A: diagnoses | error (blocked) | error (blocked) | PASS |
| DENY | B inserts row owned by A: repair_sessions | error (blocked) | error (blocked) | PASS |
| DENY | B inserts row owned by A: chat_messages | error (blocked) | error (blocked) | PASS |
| DENY | B writes into A's session as B: chat_messages | error (blocked) | error (blocked) | PASS |
| DENY | B inserts row owned by A: repair_step_progress | error (blocked) | error (blocked) | PASS |
| DENY | B inserts row owned by A: completed_repairs | error (blocked) | error (blocked) | PASS |
| HARDENING | B links own repair_sessions row to A's data | error (blocked) | error (blocked) | PASS |
| HARDENING | B links own repair_sessions row to A's data | error (blocked) | error (blocked) | PASS |
| HARDENING | B links own completed_repairs row to A's data | error (blocked) | error (blocked) | PASS |
| DENY | B deletes A's appliances | 0 rows or error | error (blocked) | PASS |
| DENY | B deletes A's diagnoses | 0 rows or error | error (blocked) | PASS |
| DENY | B deletes A's repair_sessions | 0 rows or error | 0 row(s) deleted | PASS |
| DENY | B deletes A's chat_messages | 0 rows or error | 0 row(s) deleted | PASS |
| DENY | B deletes A's completed_repairs | 0 rows or error | error (blocked) | PASS |
| DENY | B deletes A's repair_step_progress | 0 rows or error | error (blocked) | PASS |

Test data is marked S03-RLS-TEST and belongs to dedicated test accounts only.
