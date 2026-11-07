# S04 report: one client + protected endpoints

Generated: 2026-11-07T19:22:26.108Z

## Browser client check
| Status | Area | Target | Finding | Action |
|---|---|---|---|---|
| OK | summary | - | One client, no parallel auth. | - |

## Protected endpoint list (Edge Functions)
| Function | verify_jwt (gateway) | Verifies the USER in code | Reads user id from body | Verdict |
|---|---|---|---|---|
| analyze-image | default (true) | yes | no | PROTECTED |

Note: the gateway check (verify_jwt) also accepts the public anon key, so it is not proof of a logged-in user. The in-code check (_shared/auth.ts) is the real one.
