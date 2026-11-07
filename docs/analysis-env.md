# analyze-image environment names (S02)

Set with: `supabase secrets set NAME=value`   |   List names: `supabase secrets list`
Never put these in the browser / VITE_ variables / git.

| Name | Required | Default | Purpose |
|---|---|---|---|
| GEMINI_API_KEY | yes | - | Provider key (server only) |
| GEMINI_MODEL | no | gemini-3.5-flash-lite | Model ID (change without code edit) |
| ANALYSIS_TIMEOUT_MS | no | 25000 (5000-60000) | Provider call timeout |
| ANALYSIS_USER_PER_MINUTE_LIMIT | no | 3 (1-60) | Burst limit per user -> `rate_limited` + trusted Retry-After |
| ANALYSIS_USER_DAILY_LIMIT | no | 10 (1-1000) | Daily limit per user -> `quota_exceeded` |
| ANALYSIS_GLOBAL_DAILY_LIMIT | no | 200 (1-100000) | Daily limit for everybody (protects the free tier) -> `quota_exceeded` |

Auto-injected by Supabase (do not set): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
If the function logs `missing SUPABASE_URL or ... key`, set the fallbacks `APP_SUPABASE_ANON_KEY` / `APP_SUPABASE_SERVICE_ROLE_KEY` (secrets starting with SUPABASE_ cannot be set via CLI).

Limits are daily buckets in UTC. A request that reaches the provider counts even if the provider then fails (protects budget).
Set ANALYSIS_GLOBAL_DAILY_LIMIT BELOW the real free-tier limit shown in Google AI Studio for your project. The free tier is limited and can change; do not call it unlimited.
