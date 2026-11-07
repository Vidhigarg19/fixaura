# Schema comparison (repo vs live)

Generated: 2026-11-07T18:34:37.201Z

FAIL: 0 | WARN: 5 | INFO: 42

| Status | Area | Table | Finding | Suggested action |
|---|---|---|---|---|
| INFO | columns | repair_sessions | Column "id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS id. |
| INFO | columns | repair_sessions | Column "user_id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS user_id. |
| INFO | columns | repair_sessions | Column "appliance_id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS appliance_id. |
| INFO | columns | repair_sessions | Column "diagnosis_id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS diagnosis_id. |
| INFO | columns | repair_sessions | Column "title" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS title. |
| INFO | columns | repair_sessions | Column "description" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS description. |
| INFO | columns | repair_sessions | Column "issue_name" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS issue_name. |
| INFO | columns | repair_sessions | Column "diagnosis" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS diagnosis. |
| INFO | columns | repair_sessions | Column "steps" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS steps. |
| INFO | columns | repair_sessions | Column "current_step" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS current_step. |
| INFO | columns | repair_sessions | Column "status" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS status. |
| INFO | columns | repair_sessions | Column "image_path" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS image_path. |
| INFO | columns | repair_sessions | Column "created_at" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS created_at. |
| INFO | columns | repair_sessions | Column "updated_at" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS updated_at. |
| INFO | columns | repair_sessions | Column "completed_at" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS completed_at. |
| INFO | columns | chat_messages | Column "id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS id. |
| INFO | columns | chat_messages | Column "session_id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS session_id. |
| INFO | columns | chat_messages | Column "user_id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS user_id. |
| INFO | columns | chat_messages | Column "role" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS role. |
| INFO | columns | chat_messages | Column "content" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS content. |
| INFO | columns | chat_messages | Column "created_at" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS created_at. |
| INFO | columns | repair_step_progress | Column "repair_session_id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS repair_session_id. |
| INFO | columns | repair_step_progress | Column "step_id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS step_id. |
| INFO | columns | repair_step_progress | Column "status" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS status. |
| INFO | columns | repair_step_progress | Column "created_at" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS created_at. |
| INFO | columns | repair_step_progress | Column "updated_at" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS updated_at. |
| INFO | columns | diagnoses | Column "id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS id. |
| INFO | columns | diagnoses | Column "user_id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS user_id. |
| INFO | columns | diagnoses | Column "appliance_type" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS appliance_type. |
| INFO | columns | diagnoses | Column "issue_title" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS issue_title. |
| INFO | columns | diagnoses | Column "diagnosis_result" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS diagnosis_result. |
| INFO | columns | diagnoses | Column "created_at" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS created_at. |
| INFO | columns | appliances | Column "id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS id. |
| INFO | columns | appliances | Column "user_id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS user_id. |
| INFO | columns | appliances | Column "name" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS name. |
| INFO | columns | appliances | Column "appliance_type" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS appliance_type. |
| INFO | columns | completed_repairs | Column "id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS id. |
| INFO | columns | completed_repairs | Column "user_id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS user_id. |
| INFO | columns | completed_repairs | Column "diagnosis_id" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS diagnosis_id. |
| INFO | columns | completed_repairs | Column "repair_summary" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS repair_summary. |
| INFO | columns | completed_repairs | Column "completed_at" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS completed_at. |
| INFO | columns | completed_repairs | Column "feedback_rating" is used by the code but missing in live. | ALTER TABLE ... ADD COLUMN IF NOT EXISTS feedback_rating. |
| WARN | link ownership | repair_sessions | INSERT policies do not verify ownership of linked rows (appliances, diagnoses). | Add a RESTRICTIVE policy (see reconcile migration). |
| WARN | link ownership | repair_sessions | UPDATE policies do not verify ownership of linked rows (appliances, diagnoses). | Add a RESTRICTIVE policy (see reconcile migration). |
| WARN | link ownership | completed_repairs | INSERT policies do not verify ownership of linked rows (diagnoses). | Add a RESTRICTIVE policy (see reconcile migration). |
| WARN | link ownership | chat_messages | INSERT policies do not verify ownership of linked rows (repair_sessions). | Add a RESTRICTIVE policy (see reconcile migration). |
| WARN | link ownership | chat_messages | UPDATE policies do not verify ownership of linked rows (repair_sessions). | Add a RESTRICTIVE policy (see reconcile migration). |
