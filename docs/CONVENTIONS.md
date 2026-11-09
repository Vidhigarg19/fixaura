# Conventions

Rules for writing and changing code in this repository. Read [ARCHITECTURE.md](ARCHITECTURE.md) first.

**How to read this document.** The rules say what **new and changed** code should do. Existing code does not always follow them (see "Known deviations" in the architecture document). Do not rename or restructure existing files just to match; rename only as a planned, behavior-preserving step. The following are **frozen** and must not change without an agreed migration:

- route paths in `src/App.tsx`
- storage keys: `fixaura-locale`, `fixaura-session`, `homegenie-capture-draft`
- existing locale keys
- the `analyze-image` request/response contract, table and column names, and migrations
- V05, V07, V08 and danger-gate behavior

## Contents

1. [Naming](#naming)
2. [Error handling](#error-handling)
3. [State management](#state-management)
4. [API and service layer](#api-and-service-layer)
5. [Text and accessibility](#text-and-accessibility)
6. [Tests](#tests)
7. [Documentation and comments](#documentation-and-comments)
8. [Checklist before you finish](#checklist-before-you-finish)

## Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Directory (new) | lowercase, one word where possible | `hooks`, `config`, `services` |
| Page file | `PascalCase.tsx`, named after the screen, default export | `DiagnosisHistory.tsx` |
| Component file | `PascalCase.tsx`, one main component per file, default export | `SafetyBlockedPanel.tsx` |
| Component name | Same as the file | `SafetyBlockedPanel` |
| Props type | `<Component>Props` | `SafetyBlockedPanelProps` |
| Provider | `<Name>Provider.tsx`; context and its hook in `<name>Context.ts` | `AuthProvider.tsx`, `authContext.ts` |
| Hook | file `useThing.ts`, function `useThing`, in `src/hooks/` (existing hooks stay where they are until moved on purpose) | `useDialogFocus.ts` |
| Service | `camelCase.ts`, named for the thing it talks to, named exports only | `historyService.ts`, `mediaService.ts` |
| Util | `camelCase.ts`, named for what it decides, named exports only, **pure** | `riskDecision.ts` |
| Type file | `camelCase.ts` in `src/types/`; types used by one module stay in that module | `repair.ts` |
| Functions and variables | `camelCase`, start with a verb for functions | `loadCaptureDraft`, `isBlocked` |
| Booleans | `is`, `has`, `can`, `should` prefix | `isFixture`, `canRetry` |
| Constants | `UPPER_SNAKE_CASE` for single values and key lists; `camelCase` for objects built at runtime | `MAX_DESCRIPTION_LENGTH` |
| Types and interfaces | `PascalCase`, no `I` prefix | `DiagnosisResult` |
| Unions | string literals in `snake_case` when they mirror backend values, otherwise lowercase words | `'needs_recapture'`, `'idle'` |
| Discriminated unions | `status` for UI state machines, `kind` for result unions. Pick one per family and keep it | `{ status: 'ready' }`, `{ kind: 'none' }` |
| Storage keys (new) | `homegenie:<area>` constant in one file | `homegenie:capture-draft` |
| Routes (new) | `kebab-case`, one canonical path per screen, no aliases | `/diagnosis-history` |
| Test files | `<topic>.test.ts` or `.test.tsx` in `tests/` | `routing.test.tsx` |
| Docs | `kebab-case.md` in `docs/`, except `README.md`, `ARCHITECTURE.md`, `CONVENTIONS.md` | `analysis-env.md` |

Rules that avoid known confusion:

- Do not use the former product name in new identifiers, ids, keys or copy. Use `HomeGenie` / `homegenie`.
- One name per concept. The repair row id is `repairSessionId`; do not add more spellings.
- Do not reuse a name for a different concept (for example two different "getSession" functions). Prefix or rename the new one.
- A function in `services/` that talks to Supabase must say so in its file name or doc comment.

### Locale keys

- `group.key` in `camelCase`, grouped by feature (`nearby`, `guide`, `verify`). At most three levels.
- Add every key to **both** `en.json` and `hi.json` in the same change, with the same `{placeholders}`. The locale test fails otherwise. Do not leave Hindi equal to English unless the text is a name or a technical term, and list it in `docs/v09-i18n-coverage.md`.
- Never rename an existing key. Add a new one and stop using the old one in a separate, agreed step.
- Name a key after what the text is for, not what it says: `nearby.errorBusy`, not `nearby.theServiceIsBusy`.
- Group collections under a plural name (`nearby.categories.appliance`). `snake_case` leaf names are allowed only when they mirror a backend value (`history.outcome.needs_followup`).
- Keep `HomeGenie` and `112` as they are. Write natural Hindi, not word-for-word text.
- Do not put success wording ("fixed", "repaired", "successful", "certified", "safe to use") in any comparison or completion copy, except to deny it.

## Error handling

Every failure must end in one of: the user sees a clear message **and** a next action, or the failure is deliberately and visibly ignorable. No silent failures.

1. **Use typed errors.** A service throws a typed error with a stable `code` (like `AnalysisError`, `NearbySearchError`), not a bare `new Error('English text')`. New services define a small error class or code union next to the service. Do not detect errors by matching message text; carry a `code`.
2. **Never show raw error text.** Backend, SDK and network messages are logged (without photos, descriptions, tokens or personal data) and never rendered. The page maps `code` to a translated message with `t()`. `localizedErrorMessage` and `authErrorMessage` are the existing helpers for the two older paths.
3. **Every error message has a next action.** Retry (when the error is retryable), change the input, sign in again, go back, or use the external alternative (for example "search in Google Maps"). If the only action is to wait, say how long only when the backend gave a trusted `retryAfterSeconds`; never invent a countdown.
4. **Tell offline from failed from empty.** Offline, a failed request and a successful empty result are three different states with three different messages. Never show an empty result because a request failed.
5. **Check every result.** Always read `error` from Supabase calls. A failed save must not look like a success. Do not return placeholder ids or fake data on failure.
6. **No empty `catch`.** A `catch` either handles the error (state, message, retry), rethrows a typed error, or has a comment explaining why ignoring it is correct and what happens instead (for example "storage may be unavailable; the draft is optional"). Best-effort work (like a background upload) still logs a sanitized line.
7. **No floating promises.** `void doSomething()` is allowed only when `doSomething` handles its own errors. Otherwise add `.catch`. Event handlers that await must use try/catch or a helper that does.
8. **Announce errors.** Error text uses `role="alert"`; loading and saving use `role="status"` with `aria-live="polite"`; field errors are tied to the field with `aria-describedby` and `aria-invalid`. Never rely on colour alone.
9. **Fail closed in safety paths.** When risk, template, session or ownership data is missing or unknown, treat it as blocked or unavailable. Never default to "safe".
10. **Do not invent backend errors.** Only handle codes the backend defines (see the contract in the architecture document). Unknown codes map to a generic "service unavailable" message.

## State management

1. **Keep state at the lowest level that needs it.** Form fields, open/closed panels and similar stay in the component. Share through a provider only when several distant components need it.
2. **One source of truth per fact.** The database is the source of truth for a saved repair. `sessionStorage` is a cache for first paint only. Do not add a third copy (for example in a context) without a reason written in the code. If you must derive data, derive it; do not store it twice.
3. **Read and write the session cache only through `services/repairSession.ts`.** Do not touch the storage key anywhere else. Cache data is untrusted: validate before use (as `isValidDiagnosisSession` does).
4. **Clear on user change.** Anything scoped to a user (session cache, drafts, assistant messages) is cleared when the signed-in user changes or signs out. When adding new user-scoped state, add it to that clearing path.
5. **No secrets or photos in persistent storage.** `localStorage` holds only the language. `sessionStorage` may hold the current diagnosis cache and the description draft; never tokens. Do not add new keys without updating `docs/ARCHITECTURE.md`.
6. **Language is subscribed, not read once.** A component that shows `t()` text must re-render when the language changes (call the locale subscription or use a hook that wraps it).
7. **Make state machines explicit.** Use a discriminated union and a pure reducer for multi-step flows (see `utils/comparisonState.ts`). Ignore events that do not fit the current state.
8. **Guard async updates.** Ignore a response that arrives after the user left or after a newer request started (`requestGuard`, `AbortController`, or a latest-only loader).
9. **Do not weaken blocks.** State that records a block (risk, safety stop, unavailable guide) can be raised but not lowered by later data.

## API and service layer

1. **All outside calls live in `src/services/`.** Pages and components do not call `supabase`, `fetch`, geolocation (as a data source) or the edge function directly. If a page needs data, add or reuse a service function.
2. **Do not invent endpoints or fields.** Call only what the backend defines. If the backend has no endpoint (comparison, follow-up, observation, assistant AI), the client does not call one, does not fake a result, and shows "not available". Any new contract needs the backend owner's written agreement first and an entry in `docs/ARCHITECTURE.md`.
3. **Type the boundary.** Request and response types are declared next to the service. Responses from the network are `unknown` until checked by a validation function (see `analysisContract.ts`); prefer validation over `as` casts. Do not spread `any`.
4. **One way to get the signed-in user inside services.** Reuse one helper; do not add another `getUser()` wrapper.
5. **Timeouts.** Every call that can hang needs a bounded wait and a user-visible timeout state. `nearbyShops.ts` is the model (per-attempt and total limits). For Supabase and edge-function calls, check what the installed library supports before adding one, and agree the behavior change first.
6. **Cancellation.** A call started by a screen takes an `AbortSignal` where the library supports it, and the screen aborts it on unmount or when inputs change.
7. **Retries.** Retry only when the error is marked retryable, only a bounded number of times, and never for a request that is not safe to repeat (writes without an idempotency guard).
8. **Same shape for results.** Return data or throw a typed error. Do not mix `null` as "failed" and `null` as "not found" in one function; use a result union when both are possible (see `RehydrateResult`).
9. **Sanitize logs.** Log error codes and kinds, never photos, descriptions, tokens, e-mail addresses or raw provider text.
10. **Mirrored code must stay mirrored.** Where the browser and the edge function share a rule (error codes, safety phrases), change both in one change and add or update a test.
11. **Respect database authority.** Writes are scoped to the signed-in user (`user_id`) and use the existing columns. No schema or migration changes from front-end work.

## Text and accessibility

- All user-facing text comes from `t()`. No literal strings in JSX, `aria-label`, `title` or `placeholder`. Developer-only error text in thrown errors is allowed but must never be rendered.
- Every interactive element is keyboard-reachable, labelled, and at least 44 by 44 px on touch screens. Dialogs trap focus, close on Escape and return focus (`useDialogFocus`).
- Nothing may depend on hover or colour alone. Respect reduced motion.
- Layouts must work at 320 px wide and at 200% zoom. Wrap long text; do not truncate safety text.
- Run the manual checks in [v09-device-accessibility-checklist.md](v09-device-accessibility-checklist.md) for screens you change.

## Tests

- Add or update a characterization test whenever you change behavior that is covered, and add one before you refactor behavior that is not.
- Follow the mock rules in [ARCHITECTURE.md](ARCHITECTURE.md#mock-rules): no real network, no real keys, mock the boundary, assert what the user sees.
- Safety behavior (danger gates, V05, V07, V08) is never relaxed to make a test pass.
- Commands: `npm test`, `npm run typecheck:tests`, `npm run build`, `npm run lint`.

## Documentation and comments

- Write comments in English. Say **why**, not what. Mention the rule or restriction being protected (for example "V05").
- Update `README.md` and `docs/ARCHITECTURE.md` in the same change when you add a route, an environment variable, a storage key, a table, a backend dependency or a restriction.
- Document names of environment variables, never values. Do not paste keys, tokens, project URLs with real references, or user data into docs, tests, issues or comments.
- Do not claim a feature in docs until it exists in the code. Mark plans as plans.

## Checklist before you finish

- [ ] No literal user-facing text; keys added to both locale files.
- [ ] Failures are typed, translated, announced, and offer a next action; no empty catch.
- [ ] No new direct Supabase or `fetch` call in a page or component.
- [ ] No new storage key, route or backend call without agreement and documentation.
- [ ] Safety paths still fail closed.
- [ ] `npm run build`, `npm run lint`, `npm test`, `npm run typecheck:tests` pass.
- [ ] Docs updated; no secrets in the diff.
