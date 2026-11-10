# Architecture

Describes how HomeGenie is built **today**, where each kind of code belongs, and which restrictions must not be weakened. It is based on the repository contents. Where the code does not yet follow the intended boundaries, that is stated under [Known deviations](#known-deviations). Nothing here is a plan to add features.

Related: [README.md](../README.md), [CONVENTIONS.md](CONVENTIONS.md).

## Contents

1. [System overview](#system-overview)
2. [Folder structure and boundaries](#folder-structure-and-boundaries)
3. [Where code belongs](#where-code-belongs)
4. [State and persistence](#state-and-persistence)
5. [Routes and guards](#routes-and-guards)
6. [Safety restrictions](#safety-restrictions)
7. [Backend contract dependencies](#backend-contract-dependencies)
8. [Environment and configuration](#environment-and-configuration)
9. [Testing](#testing)
10. [Known deviations](#known-deviations)

## System overview

```
Browser (React SPA, Vite)
  Pages -> components / hooks -> services -> Supabase (Auth, Postgres, Storage)
                                          -> Edge Function analyze-image -> Gemini
                                          -> Overpass (OpenStreetMap), external only
  pure rules in utils/ and lib/safety.ts (shared policy, mirrored in the edge function)
  text via i18n t() (en.json / hi.json)
```

Main user flow:

1. `/capture`: signed-in user adds a photo and a description.
2. `services/visionAI.analyzeImage` calls `analyze-image`. The answer is checked by `services/analysisContract` before use.
3. `/diagnosis`: a risk decision is computed (`utils/riskDecision` + `lib/safety`). The diagnosis and a repair session are saved to Supabase (`repair_sessions` is the source of truth).
4. If the result is blocked, only the blocked panel and help links are shown. If not, `/tools` and `/guide` are still closed by the V05 gate (no approved templates exist).
5. `/verify` and `/completed`: the user may mark steps finished. No photo comparison runs (V07).
6. `/nearby-shops`: optional help search (V08).

## Folder structure and boundaries

| Folder | Holds | Must not hold |
|--------|-------|---------------|
| `src/Pages/` | One component per route. Composes components and calls hooks. | Direct database or network calls, validation rules, state machines. |
| `src/components/` | Reusable UI, the two providers (`AuthProvider`, `AssistantProvider`) and their context files, and `useDialogFocus`. | Supabase or `fetch` calls, business rules. |
| `src/services/` | All access to the outside: Supabase tables, storage, auth lookups, the edge function, Overpass. Also the sessionStorage cache (`repairSession.ts`) and mapping of backend data to app types. | React components or JSX. |
| `src/utils/` | Pure logic: risk decision, validation, state machines (`comparisonState`), formatting, error mapping, request guards. Plus two hooks that combine them (`useDiagnosisSource`, `useSessionLoader`). | Direct network calls (the two hooks call services). |
| `src/lib/` | The Supabase client (`supabase.ts`), the framework-free safety text policy (`safety.ts`), and the startup health check (`test-supabase.ts`). | UI. |
| `src/types/` | Shared types and the typed analysis error. | Logic beyond small type guards. |
| `src/i18n/` | `t()`, the locale store, `en.json`, `hi.json`. | Anything unrelated to text. |
| `src/dev/` | Development-only fixtures. Loaded only behind `import.meta.env.DEV`. | Code a production build needs. |
| `supabase/` | The `analyze-image` edge function, SQL migrations, audit SQL. | Front-end code. |
| `scripts/` | Backend evidence and tooling run by hand. | App code. |
| `tests/` | Vitest tests, setup, mocks. | App code. |

Intended homes that do not exist as folders yet:

- **Hooks:** today they live in `utils/` (`useDiagnosisSource`, `useSessionLoader`) and `components/` (`useDialogFocus`, `useAuth`, `useAssistant`). The convention is a `src/hooks/` folder; moving them is a separate, behavior-preserving step.
- **Config:** environment reads and tunable constants are scattered (see [Environment and configuration](#environment-and-configuration)). The convention is a `src/config/` folder.

`src/lib` versus `src/utils`: `lib` is for singletons and shared policy; `utils` is for pure helpers. New pure helpers go in `utils`.

## Where code belongs

| Kind of code | Belongs in | Examples |
|--------------|-----------|----------|
| **Business rules** (what is allowed, how risky) | `utils/` (pure) or `lib/safety.ts` | `riskDecision`, `guideAvailability`, `comparisonState`, `diagnosisUpdate` |
| **API and Supabase calls** | `services/` only | `visionAI`, `historyService`, `repairSessionDb`, `mediaService`, `nearbyShops` |
| **Response checking** | `services/` (e.g. `analysisContract`) | `diagnosisFromEnvelope` |
| **Session cache** | `services/repairSession.ts` only | `getSession`, `saveSession`, `clearSession` |
| **Shared state** | A provider in `components/` (auth, assistant) or the i18n store | `AuthProvider`, `setLocale` |
| **Screen state** (form fields, toggles, which panel is open) | The page or component | `useState` in a page |
| **Reusable logic with React state** | A hook | `useDiagnosisSource`, `useSessionLoader`, `useDialogFocus` |
| **UI text** | `en.json` and `hi.json`, read with `t()` | never a literal in JSX |
| **Rendering** | components | `SafetyBlockedPanel`, `GuideUnavailablePanel` |

Rule of thumb: if you need to test it without rendering, it is not UI code. If it talks to the outside world, it is a service. If a page needs both, the page calls a hook or service and renders the result.

## State and persistence

| State | Where | Notes |
|-------|-------|-------|
| Signed-in user | `AuthProvider` (`useAuth`) | Verified with `getSession` then `getUser`. A user change clears the session cache. |
| Language | `src/i18n/index.ts` module store, `localStorage` key `fixaura-locale`, `<html lang>` | Components re-render through `useSyncExternalStore(subscribeLocale, getLocale)`. |
| Current repair (diagnosis, description, photo data URL, steps, ids) | `sessionStorage` key `fixaura-session`, shape `RepairSession` in `types/repair.ts` | **A cache.** The `repair_sessions` row in Supabase is authoritative. The cache gives a fast first paint; `useDiagnosisSource` reconciles it with the database. |
| Capture description draft | `sessionStorage` key `homegenie-capture-draft` | Description only, never the photo. Discarded for a different user. |
| Assistant panel | `AssistantProvider` (messages, open state, `mockMode`, repair context) | Messages are saved to `chat_messages` when a repair session exists. |
| Server data (history, saved sessions) | Loaded per page or hook, no shared cache | `?session=<id>` is loaded by `useSessionLoader`. |
| Directory search results | Component state plus a 2-minute in-memory cache in `services/nearbyShops.ts` | Exact coordinates are never stored or logged. |

**Do not rename the storage keys or change their shape** without a migration that reads the old key. The two older keys still use the former product name on purpose.

## Routes and guards

Defined in `src/App.tsx`. `ProtectedRoute` requires a signed-in user. `GuestRoute` is for `/login` and `/signup`. `NearbyShopsRoute` also requires a valid diagnosis session. The full table is in the [README](../README.md#routes). Do not rename, remove or re-guard routes as part of refactoring.

## Safety restrictions

These are product and safety decisions. Refactors must keep the behavior and the tests below must keep passing.

### Danger gates (risk decision)

- `utils/riskDecision.ts`: four levels (`safe`, `caution`, `professional`, `emergency`). `professional` and `emergency` are **blocked**. The most severe signal always wins. Unknown or missing risk data blocks. A safety stop blocks even when severity is low. A later response can never lower a blocked decision (`nextDecision`).
- `lib/safety.ts`: text screening in English and Hindi (gas, fire, electrical, structural, chemical, medical, water near electricity, bypassing safety). It only raises risk, never lowers it. The edge function carries a copy of the rules (`supabase/functions/analyze-image/logic.ts`); both copies and `SAFETY_POLICY_VERSION` must change together.
- `utils/diagnosisUpdate.ts`: a blocked diagnosis cannot be replaced, and hazards in follow-up answers escalate the stored result.
- `Pages/Diagnosis`: the shown decision is the most severe of the risk decision and the text screen. A blocked result shows `SafetyBlockedPanel` and no way to continue. There is no "continue anyway" action.
- `SafetyBubble`: Escape and the backdrop only cancel; the confirm and cancel meanings are unchanged.

### V05: guide restriction

- `utils/guideAvailability.ts` is the single gate for `/tools` and `/guide`. It is fail-closed: no agreed backend data, no template id, an unknown template id, or a stale policy version all mean "unavailable".
- The registry of approved template ids is **empty** for live content. Fixture template ids are honoured only in fixture mode.
- Model free-text tools and generated steps are never shown as a checklist and never saved (`steps: []` when a session is saved). `AssistantProvider` strips tools and steps from the assistant context while the guide is unavailable, and the assistant answers "no approved guide" for step or tool questions.
- Contract dependency: opening the guide needs the backend to return an approved template id with a matching policy version. That field does not exist in today's `analyze-image` response.

### V07: honest comparison

- `utils/comparisonState.ts` and `Pages/Verify`: both photos are required before a comparison could start. Server statuses would map to neutral labels that describe the photo (for example "the problem still looks visible"), never to "fixed" or "safe". `needs_professional` is the most severe.
- No comparison service exists, so pressing Compare **sends nothing**, saves nothing, and shows "unavailable" (or "offline"). "Finish steps" only marks the steps finished; the Completion screen says it is not a safety check.
- Contract dependency: a comparison needs a backend mode that is not implemented. Do not invent one on the client. `services/visionAI.verifyRepair` and `services/observationService.ts` are unreachable code and must not be wired to the UI. In particular `observationService` contains a hard-coded simulated result that must never be shown.

### V08: nearby help

- `Pages/NearbyShops` and `services/nearbyShops.ts`: location is requested only after a button press; coordinates stay in memory. Every failure (denied, unavailable, timeout, insecure page, offline, busy, directory down) has its own message. An empty result says the directory may be incomplete. Results are labelled as unverified community data and credit OpenStreetMap.
- Maps are an external handoff: Google Maps links open in a new tab with `noopener`. A typed area is never looked up by HomeGenie; coordinates sent to Google Maps are rounded.

### Other recorded restrictions

- V04 blocked panel and follow-up questions: follow-up questions appear only from backend data; none is sent today.
- V06 resume: `?session=<id>` loads only the signed-in user's own row.
- S07 guide payload and S08/S09 observation and private media rules are described in the code comments of `guideAvailability.ts`, `observationPolicy.ts` and `mediaService.ts`.

## Backend contract dependencies

The front end depends on these backend facts. **Do not assume more than this list.**

**Edge function `analyze-image`** (`supabase/functions/analyze-image`)

- Request: `{ imageBase64: string, mediaType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif', description: string }`. The description is 1 to 500 characters after trimming. The client sends only JPEG, PNG or WebP. Other fields are ignored.
- Success: `{ ok: true, data }` with `issueName`, `confidence` (0 to 100), `severity` (`low | medium | high`), `summary`, `recommendedFix`, `recommendedTools[]`, `nextStepAdvice`, `safetyWarning`, `explanation`, and optional `safetyStop` and `guideSteps[]`. Each guide step includes `id`, `title`, `instruction`, `safetyNote`, `requiresConfirmation`, `visualCue`, and `estimatedSeconds`; the frontend validates this optional field before including it in the parsed result.
- Failure: `{ ok: false, error: { code, retryable, retryAfterSeconds? } }`. Codes: `invalid_input`, `unauthenticated`, `forbidden`, `rate_limited`, `quota_exceeded`, `service_unavailable`, `invalid_response`, `configuration_error`. The client mirrors the codes in `types/analysis.ts`; both lists must stay equal.
- Not implemented: `verify`, `follow_up` and observation modes.
- Limits and secrets: [analysis-env.md](analysis-env.md).

**Database and storage used by the client:** tables `appliances`, `diagnoses`, `repair_sessions`, `repair_step_progress`, `chat_messages`, `completed_repairs`, `repair_observations`; storage bucket `repair-private-media`. The expected schema is in `docs/schema/expected-schema.json`; whether a live project matches it is checked with `scripts/s03-*` (see [schema-comparison.md](schema-comparison.md)). Migrations are never edited as part of front-end work.

**External:** OpenStreetMap Overpass (two public endpoints, listed in `services/nearbyShops.ts`) and Google Maps links. No keys are involved.

## Environment and configuration

| Name | Read in | Purpose |
|------|---------|---------|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | `src/lib/supabase.ts`, `src/lib/test-supabase.ts` | Supabase client (required). |
| `VITE_ENABLE_FIXTURES` | `src/utils/fixtureGate.ts`, `src/Pages/CameraCapture.tsx` | Dev fixtures. Works only with `import.meta.env.DEV`. |
| Edge function names | `supabase/functions/analyze-image/index.ts` | See [analysis-env.md](analysis-env.md). |

Notes:

- `.env.example` has names and placeholders only. `.env.local` is git-ignored.
- `src/lib/test-supabase.ts` sends one request to the Supabase auth health endpoint each time the app loads, in every build. It only logs the result.
- Tunable values (size limits, timeouts, thresholds, external URLs) are currently constants inside the files that use them. A `src/config/` folder is the intended home.

### Development fixtures

With `npm run dev`, `VITE_ENABLE_FIXTURES=true` and `?fixture=<name>`, the app uses built-in test data instead of the network. Names: analysis fixtures (`success`, `blocked`, `blocked_professional`, `blocked_emergency`, `needs_followup`, `followup_escalates`, `followup_error`, `invalid_input`, `unauthenticated`, `rate_limited`, `quota_exceeded`, `service_unavailable`, and others in `src/dev/analysisFixtures.ts`), session fixtures (`session_loading`, `session_not_found`, `session_offline`, `session_error`, `session_in_progress`, `session_blocked`, `session_completed`, `session_missing_photo`) and history fixtures (`history_mixed`, `history_legacy_row`). Fresh fixtures on `/tools` and `/guide` use a fixed route-level banner so blocked/loading early returns cannot hide it; session fixtures keep their in-page banner. Production builds remove these branches.

## Testing

Commands:

```bash
npm test                  # vitest run: characterization tests, once
npm run test:watch
npm run typecheck:tests   # strict type check of tests/ (tsconfig.test.json)
npm run build             # also type-checks src/
npm run lint
```

### What the characterization tests are

They record what the app does **now**, so a refactor can prove it did not change behavior. They are not a specification of how the app should ideally behave. If a test fails after a change, either the change altered behavior (undo it or get agreement) or the behavior was intentionally changed (update the test in the same change, with the reason).

| File | Covers |
|------|--------|
| `tests/locale-parity.test.ts` | 616 keys in each language, identical keys, no duplicate keys, same `{placeholders}`, intentional empty values |
| `tests/routing.test.tsx` | All 16 routes signed out, signed-in redirects and pages |
| `tests/guide-restriction.test.tsx` | V05 gate and `/tools`, `/guide` panels |
| `tests/comparison-v07.test.tsx` | V07 no-request comparison, no success wording, state rules |
| `tests/nearby-v08.test.tsx` | V08 failure, empty and handoff behavior |
| `tests/danger-gates.test.tsx` | Risk rules, text screening, blocked panels in the app |
| `tests/services.test.ts` | Helpers and services with stubbed network |

### Mock rules

1. **No real network, ever.** `tests/setup.ts` replaces `fetch` with a function that throws. Supabase, the edge function and storage are replaced by `tests/helpers/supabaseMock.ts`. Tests assert that no request was made where that matters.
2. **No real keys or env files.** `vitest.config.ts` sets `envDir` to the empty `tests/env/` and supplies placeholder values, so `.env.local` is never read.
3. **Mock the boundary, not the logic.** Stub Supabase, `fetch`, geolocation, media and speech. Do not stub the code under test. A single exception: the camera widget is replaced in the V07 test because jsdom has no camera.
4. **Use the app's own helpers to set up data** (for example `saveSession` through `tests/helpers/fixtures.ts`) rather than writing storage keys by hand, so renaming internals does not break unrelated tests.
5. **Assert what a user can observe** (text, links, redirects, calls to the outside world), not component internals or hook state. Build expected text with `t('key')` instead of copying strings.
6. **Make no production change to make a test pass.** Tests describe the code; they do not change it.

### Not covered

The camera, microphone and speech flows of `CameraCapture`; the Diagnosis save sequence against a database; the `?session=` loader on `/tools` and `/guide`; sign-in form submission; focus traps and layout (use [v09-device-accessibility-checklist.md](v09-device-accessibility-checklist.md)); the edge function (it has its own Deno test, `supabase/functions/analyze-image/logic_test.ts`); and the dev-fixture branches.

## Known deviations

Where today's code differs from the boundaries above. These are recorded facts, not requests to change behavior.

- `Pages/Diagnosis.tsx` calls Supabase directly for the save workflow (appliances, diagnoses, repair sessions). `Pages/DiagnosisHistory.tsx` and `Pages/Auth.tsx` also call Supabase directly. `Login.tsx` does too but is not routed.
- Speech recognition is set up three times (`VoiceInput`, `CameraCapture`, `AssistantWidget`) with different settings. Camera handling is duplicated between `CameraCapture` and `PhotoCapture`.
- Several services each define their own signed-in-user lookup. Row types are cast with `as` and are not generated from the schema.
- No Supabase call has a timeout or cancellation. Only the Overpass search does.
- `Pages/Diagnosis.tsx`, `CameraCapture.tsx` and others are large and mix several concerns.
- `Pages` is the only capitalised source folder, and hooks have no folder of their own.
- Unreachable code exists: `Pages/Login.tsx`, `components/CameraDiagnostics.tsx`, `services/observationService.ts`, `types/observation.ts`, `visionAI.verifyRepair`, `repairSessionDb.persistObservation` (the documented writer of `repair_sessions.observation`, which rehydration still reads). Dependencies `lottie-react` and `react-countup` are unused. They are kept until the owner approves removal.
- `tsconfig.app.json` is not in `strict` mode.
