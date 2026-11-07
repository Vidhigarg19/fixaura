# S01 — Removed Fallbacks Audit

## Objective

Identify mock implementations, fake AI responses and fallback mechanisms in the HomeGenie codebase, including the repair verification flow.

## Search Commands

```powershell
git grep -n -i "mock" -- src supabase
git grep -n "getMockVerification" -- src
git grep -n -i "verification" -- src
```

## 1. Initial Mock-Related Search Results

The following was the initial search snapshot before integration. Search hits are not necessarily runtime fallbacks; see the audit summary for current disposition.

| No. | File | Line | Matched Code / Function | Action Required |
|---:|---|---:|---|---|
| 1 | `src/Pages/Verify.tsx` | 362 | `result.mock` | Review verification mock indicator |
| 2 | `src/components/AssistantProvider.tsx` | 30 | `useState(true)` for `mockMode` | Review default mock mode |
| 3 | `src/components/AssistantProvider.tsx` | 60 | `setMockMode(true)` | Review mock fallback activation |
| 4 | `src/components/AssistantProvider.tsx` | 74 | `mockMode` | Review mock state exposure |
| 5 | `src/components/AssistantProvider.tsx` | 75 | `setMockMode` | Review mock state setter |
| 6 | `src/components/AssistantProvider.tsx` | 84 | `mockMode` | Review mock state usage |
| 7 | `src/components/AssistantWidget.tsx` | 51 | `mockMode` | Review mock state consumption |
| 8 | `src/components/AssistantWidget.tsx` | 52 | `setMockMode` | Review mock state setter |
| 9 | `src/components/AssistantWidget.tsx` | 193 | `setMockMode(reply.mock)` | Review mock response handling |
| 10 | `src/components/AssistantWidget.tsx` | 203 | `setMockMode` in dependency array | Review state dependency |
| 11 | `src/components/AssistantWidget.tsx` | 345 | `mockMode` | Review mock indicator |
| 12 | `src/components/assistantContext.ts` | 20 | `mockMode: boolean` | Review context type |
| 13 | `src/components/assistantContext.ts` | 21 | `setMockMode: (mock: boolean) => void` | Review context type |
| 14 | `src/i18n/en.json` | 176 | `AR Repair Mockup` | Check image description |
| 15 | `src/i18n/en.json` | 399 | `mockReply` | Review sample response translation |
| 16 | `src/i18n/hi.json` | 399 | `mockReply` | Review sample response translation |
| 17 | `src/services/assistantService.ts` | 19 | `mock: boolean` | Review response type |
| 18 | `src/services/assistantService.ts` | 160 | `TODO(Claude): Replace the mock below with a Supabase Edge Function call` | Review outdated integration comment |
| 19 | `src/services/assistantService.ts` | 174 | `mock: true` | Review hazard response |
| 20 | `src/services/assistantService.ts` | 214 | `mock: true` | Review mock response generation |
| 21 | `src/services/visionAI.ts` | 128 | `getMockVerification()` | Review mock verification function |
| 22 | `src/services/visionAI.ts` | 149 | `mock: true` | Review mock verification result |
| 23 | `src/services/visionAI.ts` | 167 | `getMockVerification(params.locale)` | Review fallback invocation |
| 24 | `src/services/visionAI.ts` | 206 | `getMockVerification(params.locale).checks` | Review fallback checks |
| 25 | `src/services/visionAI.ts` | 208 | `mock: Boolean(raw.mock)` | Review mock status propagation |
| 26 | `src/services/visionAI.ts` | 211 | `using mock result` | Review fallback warning |
| 27 | `src/services/visionAI.ts` | 213 | `getMockVerification(params.locale)` | Review fallback return |
| 28 | `src/types/repair.ts` | 10 | `mock: boolean` | Review repair verification type |

## 2. Mock Verification Search Results

| No. | File | Line | Matched Code / Function | Action Required |
|---:|---|---:|---|---|
| 1 | `src/services/visionAI.ts` | 128 | `export function getMockVerification(locale: string)` | Inspect mock implementation |
| 2 | `src/services/visionAI.ts` | 167 | `return getMockVerification(params.locale)` | Inspect fallback when verification service is unavailable |
| 3 | `src/services/visionAI.ts` | 206 | `checks: checks.length > 0 ? checks : getMockVerification(params.locale).checks` | Inspect fallback checks for empty response |
| 4 | `src/services/visionAI.ts` | 213 | `return getMockVerification(params.locale)` | Inspect catch-block fallback |

## 3. General Verification Search Results

| No. | File | Line | Matched Code / Function | Classification |
|---:|---|---:|---|---|
| 1 | `src/Pages/History.tsx` | 236–246 | Diagnosis verification status | History UI |
| 2 | `src/Pages/History.tsx` | 324–344 | Verification summary and next advice | History UI |
| 3 | `src/Pages/Verify.tsx` | 27 | Verification-related type imports | Type usage |
| 4 | `src/Pages/Verify.tsx` | 40–41 | Existing verification state | Verification UI |
| 5 | `src/Pages/Verify.tsx` | 68–77 | `verifyRepair()` call and result handling | Verification flow |
| 6 | `src/Pages/Verify.tsx` | 79 | Verification error logging | Error handling |
| 7 | `src/Pages/Verify.tsx` | 86–93 | Save verification result | Persistence |
| 8 | `src/Pages/Verify.tsx` | 158 | Verification status usage | Type/UI |
| 9 | `src/components/AuthProvider.tsx` | 50–53 | Authentication verification | Authentication |
| 10 | `src/components/PhotoCapture.tsx` | 59 | Verification camera error | Camera error handling |
| 11 | `src/components/PhotoCapture.tsx` | 96 | Camera preview error | Camera error handling |
| 12 | `src/components/PhotoCapture.tsx` | 126 | Verification photo processing error | Camera error handling |
| 13 | `src/components/PhotoCapture.tsx` | 137 | Uploaded verification photo processing error | Camera error handling |
| 14 | `src/i18n/en.json` | 470 | Repair Verification title | UI translation |
| 15 | `src/services/completedRepair.ts` | 70 | Completion session verification failure | Session validation |
| 16 | `src/services/completedRepair.ts` | 85 | Completion diagnosis verification failure | Diagnosis validation |
| 17 | `src/services/visionAI.ts` | 1 | Verification-related type imports | Type usage |
| 18 | `src/services/visionAI.ts` | 128 | `getMockVerification()` | Mock implementation |
| 19 | `src/services/visionAI.ts` | 161 | `verifyRepair()` | Verification service |
| 20 | `src/services/visionAI.ts` | 167 | Mock fallback invocation | Fallback |
| 21 | `src/services/visionAI.ts` | 185 | Invalid response error | Response validation |
| 22 | `src/services/visionAI.ts` | 189 | Verification status | Response processing |
| 23 | `src/services/visionAI.ts` | 205–206 | Summary and checks fallback | Response processing |
| 24 | `src/services/visionAI.ts` | 208 | Mock status propagation | Response processing |
| 25 | `src/services/visionAI.ts` | 211 | Mock fallback warning | Error handling |
| 26 | `src/services/visionAI.ts` | 213 | Mock fallback return | Fallback |
| 27 | `src/types/repair.ts` | 3 | VerificationStatus type | Type definition |
| 28 | `src/types/repair.ts` | 5–6 | RepairVerification interface | Type definition |
| 29 | `src/types/repair.ts` | 24 | Optional verification property | Type definition |

## 4. Audit Summary

- Diagnosis responses now require a valid `{ ok: true, data }` envelope and every required diagnosis field. Provider errors use the typed `{ ok: false, error }` contract; the frontend throws `AnalysisError` instead of constructing a diagnosis.
- Verification responses now require a valid success envelope, a recognized status, non-empty summary/advice, and at least one well-formed check. Empty checks and invalid fields are errors; no checks are filled in.
- The old `getMockVerification()` behavior fabricated a resolved status and passing checks for unavailable services, missing checks, and caught errors. That implementation is not present in the current service. The stale `result.mock` success badge was also removed.
- Legacy session/history verification objects marked `mock: true` are ignored by Verify and normalized as in-progress in History. Existing database rows are not modified by this change.
- Supabase Edge Function authentication is explicitly verified before analysis. The handler supports both diagnosis and verification modes, validates image signatures/size and request fields, enforces a timeout, validates model output, and emits only sanitized error codes to clients.
- Safety Stop behavior is enforced for reported/detected gas hazards, dangerous electrical conditions, smoke, fire, and other listed hazards. Hazardous diagnoses do not contain DIY repair instructions; hazardous verification returns professional status and failed checks.
- Gemini response text is used only for internal error classification/validation and is not included in server logs or client messages. Logs contain safe status, error category/code, and timeout/network classification only.
- An explicit “skip verification” action remains available before an API failure. After a verification error, Skip and Finish are blocked; the photo and note remain available for retry.
- The assistant widget still produces clearly labeled demo/mock replies (`src/services/assistantService.ts`, `src/components/AssistantProvider.tsx`, and `src/components/AssistantWidget.tsx`). This is a separate assistant feature, not a diagnosis or repair-verification success fallback, and was not changed in this audit.
- “Mockup” image alt text and translated sample/demo copy are not runtime diagnosis or verification results and were not removed.

## 5. Important Notes

1. Search matches do not automatically mean fake fallback behavior.
2. Authentication checks, camera errors, history UI and type definitions are not automatically fake fallbacks.
3. Translation strings and image descriptions should not be removed just because they contain the word mock.
4. Provider failure and malformed response paths must stay failures; they must never construct successful diagnosis or verification data.
5. Existing real AI integrations, repair history and verification functionality must remain intact.
6. This change does not clean or rewrite already persisted database records. Legacy mock verification records are no longer presented as verified/completed in the History UI.

## 6. Verification

Validation commands:

```powershell
npm run build
npm run lint
deno check --no-lock --no-config supabase\functions\analyze-image\index.ts
deno test --no-check --no-config supabase\functions\analyze-image\logic_test.ts
```

The Deno tests use a stubbed Gemini transport; they do not make a live provider request.