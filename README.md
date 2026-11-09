<p align="center">
  <img src="public/homegenie-logo.png" alt="HomeGenie" width="160" />
</p>

<h1 align="center">HomeGenie</h1>

<p align="center">
  <strong>Your home our intelligence</strong><br/>
  A browser app that helps people understand a household problem from a photo and a short description,
  see the risk first, and find nearby help.
</p>

---

## Contents

1. [What it does today](#what-it-does-today)
2. [Limitations and things that do not exist](#limitations-and-things-that-do-not-exist)
3. [Tech stack](#tech-stack)
4. [Getting started](#getting-started)
5. [Scripts](#scripts)
6. [Environment variables](#environment-variables)
7. [Routes](#routes)
8. [Architecture and folder conventions](#architecture-and-folder-conventions)
9. [Safety restrictions](#safety-restrictions)
10. [Backend (Supabase)](#backend-supabase)
11. [Testing](#testing)
12. [Languages (i18n)](#languages-i18n)
13. [Design tokens](#design-tokens)
14. [Camera troubleshooting](#camera-troubleshooting)
15. [Deployment](#deployment)
16. [Documentation index](#documentation-index)
17. [Contributing and license](#contributing-and-license)

---

## What it does today

This list describes what the code in this repository does now.

- **Photo and description diagnosis.** A signed-in user takes or uploads a photo (JPEG, PNG or WebP) and describes the problem (10 to 500 characters). The image is sent to the `analyze-image` Supabase Edge Function, which calls Gemini and returns a diagnosis. The result is AI-generated and can be wrong.
- **Risk first.** Every result gets a risk decision (safe, caution, professional, emergency). Professional and emergency results are blocked: no tools, no steps, and a panel that points to nearby help (and to `112` for emergencies).
- **Follow-up screen states.** The diagnosis screen can show follow-up questions, but only when the backend sends them. No backend sends them today (see limitations).
- **Saved repairs.** For signed-in users the diagnosis and a repair session are saved to Supabase. `/history` lists repairs and `/diagnosis?session=<id>` reopens one from the database. Photos are stored in a private storage bucket and removed when the repair is deleted.
- **Nearby help.** `/nearby-shops` looks up repair and parts shops in OpenStreetMap data (Overpass) after the user presses a button and allows location. It can also open a Google Maps search for a typed city or area.
- **Accounts.** Email and password, and Google sign-in, through Supabase Auth.
- **English and Hindi**, switchable at any time, with keyboard, screen-reader and small-screen support (see [docs/v09-i18n-coverage.md](docs/v09-i18n-coverage.md)).
- **Assistant widget** for signed-in users. Replies are local demo replies written in the app and are labelled as such. There is no AI backend behind it.

## Limitations and things that do not exist

Read this before relying on a feature. Items marked "not implemented" are **not** in this repository.

| Area | Current state |
|------|---------------|
| Guided repair (`/tools`, `/guide`) | **Closed on purpose.** It opens only for a reviewed, approved template. The approved-template list is empty, so every live result shows a "not available" panel with no checklist and no steps. |
| Before/after photo comparison (`/verify`) | **No comparison service exists.** The screen collects the photos, but pressing Compare sends nothing and shows "not available". It never says a repair worked. "Finish steps" only records that the user marked the steps finished. |
| Follow-up questions | The client code is ready, but the `analyze-image` function has no follow-up mode. They appear only with dev fixtures. |
| Observation / verify modes of `analyze-image` | Not implemented in the function. The function accepts a photo and a description only. |
| AI assistant | Not implemented. Replies are local demo replies (`mockMode`). |
| Cost estimates | The older README had cost tables. They were not based on this code and were removed. |
| AWS (Bedrock, S3, SQS, Lambda, CloudFront, SES, SNS, Secrets Manager) | **Not implemented.** No AWS code or infrastructure files are in this repository. |
| Apple sign-in | Not implemented. |
| Extra edge functions (`plan`, `history`, `feedback`) | Not implemented. Only `analyze-image` exists. |
| Offline use / PWA | Not implemented. |
| Shop data | Community map data. It can be incomplete or out of date and is not verified by HomeGenie. |
| Voice | Uses the browser's speech recognition where available. Support varies by browser. Voice commands on the repair guide are matched in English only. Every action also works with buttons. |
| Tests | Characterization tests exist for routing, locale parity, V05, V07, V08, danger gates and service helpers. There are no end-to-end tests and the camera, microphone and database save flows are not covered. |
| Deployed header | `vercel.json` sets `Permissions-Policy: microphone=()`. Whether voice input works in a deployed build with that header has not been checked. |

## Tech stack

| Technology | Version (see `package.json`) | Use |
|-----------|------------------------------|-----|
| React | 19 | UI, lazy-loaded routes |
| TypeScript | 6 | Types (the app config is not in `strict` mode yet) |
| Vite | 8 | Dev server and build |
| Tailwind CSS | 4 | Styling with `@theme` tokens in `src/index.css` |
| Framer Motion | 12 | Transitions (respects reduced motion) |
| React Router | 7 | Routing |
| `@supabase/supabase-js` | 2 | Auth, database, storage and edge function calls |
| Lucide React | 1 | Icons |
| `react-intersection-observer` | 10 | Landing page reveal animations |
| Vitest, jsdom, Testing Library | dev only | Tests |

`lottie-react` and `react-countup` are listed in `package.json` but are not imported by any source file.

Backend: Supabase (Auth, Postgres, Storage, Edge Functions on Deno). AI: Google Gemini, called only from the edge function (default model name is set in `supabase/functions/analyze-image/index.ts` and can be overridden with `GEMINI_MODEL`).

## Getting started

Requirements: Node.js and npm (developed with Node 24; use a Node version supported by Vite 8) and a Supabase project.

```bash
git clone <your repository URL>
cd FixAura
npm install

# Create your local env file (git-ignored) and fill in your own Supabase values
cp .env.example .env.local        # PowerShell: Copy-Item .env.example .env.local

npm run dev                       # http://localhost:5173
```

The app **cannot start without** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`: `src/lib/supabase.ts` throws at load. There is no mock-data mode.

Camera access needs HTTPS or `localhost`.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server (opens the browser). |
| `npm run build` | `tsc -b` (type check) then `vite build`. Output goes to `dist/`. |
| `npm run preview` | Serves the production build locally. |
| `npm run lint` | ESLint over the whole repository. |
| `npm test` | Runs the Vitest suite once (`vitest run`). |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run typecheck:tests` | Type-checks the tests (`tsconfig.test.json`). Not part of `npm run build`. |

Scripts in `scripts/` (`s01` to `s04`) are evidence and tooling for the backend work. They are not wired to npm scripts. Their headers say how to run them (`npx tsx scripts/<file>.ts`); `tsx` is not a project dependency.

## Environment variables

Names and safe placeholders only. Real values live in your own `.env.local` (git-ignored), in Vercel project settings, or in Supabase secrets. Never commit them.

**Browser (Vite). These are bundled into the page, so never put a secret in a `VITE_` variable.**

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | The publishable (client-safe) key. Row-level security protects the data. |
| `VITE_ENABLE_FIXTURES` | No | Development only. `true` allows `?fixture=<name>` test data in a dev build. Has no effect in a production build. Keep `false` otherwise. |

**Supabase Edge Function secrets** (set with `supabase secrets set NAME=value`, never in the browser): `GEMINI_API_KEY` (required), `GEMINI_MODEL`, `ANALYSIS_TIMEOUT_MS`, `ANALYSIS_USER_PER_MINUTE_LIMIT`, `ANALYSIS_USER_DAILY_LIMIT`, `ANALYSIS_GLOBAL_DAILY_LIMIT`. Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` itself. Defaults and limits: [docs/analysis-env.md](docs/analysis-env.md).

**Scripts only:** `EVAL_EMAIL`, `EVAL_PASSWORD`, `EVAL_DELAY_MS` (`scripts/s02-eval.ts`) and `S04_EMAIL`, `S04_PASSWORD` (`scripts/s04-auth-probe.ts`). Use dedicated test accounts.

## Routes

Defined in `src/App.tsx`. Routes must not be renamed or removed without a decision.

| Path | Page | Access |
|------|------|--------|
| `/` | Landing | Public |
| `/login`, `/signup` | Sign in / sign up | Guests only (a signed-in user is redirected on) |
| `/auth` | Redirects to `/login` | Public |
| `/capture`, `/camera` | Photo and description (same page) | Public page, but analysis needs sign-in |
| `/diagnosis` | Diagnosis result (also `?session=<id>`) | Public route, needs a valid session |
| `/tools`, `/guide` | Guided repair | Public route; shows the "not available" panel today |
| `/verify` | Before/after screen | Public route; comparison unavailable |
| `/completed` | Steps-finished screen | Public route |
| `/dashboard`, `/history`, `/diagnosis-history` | Account pages | Signed-in only |
| `/nearby-shops` | Nearby help | Signed-in only, and needs a valid diagnosis session (otherwise `/dashboard`) |
| `*` | Redirects to `/` | Public |

## Architecture and folder conventions

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Naming and coding rules: [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

```
src/
├── main.tsx, App.tsx          Entry, router, route guards, providers
├── index.css                  Tailwind tokens, keyframes, Hindi and skip-link rules
├── Pages/                     One file per route (screens)
├── components/                Shared UI, providers/contexts, one focus hook
├── services/                  Supabase, edge function and network access, session logic
├── utils/                     Pure logic (risk, validation, state machines) and two hooks
├── lib/                       Supabase client, safety text policy, startup health check
├── types/                     Shared types
├── i18n/                      t(), en.json, hi.json
└── dev/                       Development-only fixtures (never in a production build)
supabase/                      Edge function (analyze-image), migrations, audit SQL
scripts/                       Backend evidence and tooling (not part of the app)
tests/                         Vitest characterization tests and mocks
docs/                          Architecture, conventions and evidence reports
```

Boundaries in one line each: pages compose and render; components render; services talk to the outside world; utils are pure; types hold shapes; `t()` is the only source of user-facing text. Some current files do not follow this yet; the architecture document lists where.

## Safety restrictions

These are deliberate and must keep working. Details and file references are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#safety-restrictions).

- **Danger gates:** the most severe risk signal always wins and a blocked result can never be lowered. Dangerous wording in a description or answer escalates the result. The same text policy runs in the browser and in the edge function.
- **V05, guide restriction:** no checklist or repair steps unless a reviewed, approved template exists. Generated steps are never shown or saved.
- **V07, honest comparison:** a photo comparison cannot confirm that a repair worked, so none is run and no success wording is used.
- **V08, nearby help:** failures and empty results are stated plainly, shop data is labelled unverified, and maps are an external handoff.

## Backend (Supabase)

- **Edge function** `supabase/functions/analyze-image` (Deno). It checks the signed-in user, applies per-user and global quotas, calls Gemini with a timeout, validates the answer, and applies the safety gate. Request: `{ imageBase64, mediaType?, description }`. Response: `{ ok: true, data }` or `{ ok: false, error: { code, retryable, retryAfterSeconds? } }`. It has no `verify`, `follow_up` or observation mode.
- **Migrations** in `supabase/migrations/` (SQL). The client reads and writes: `appliances`, `diagnoses`, `repair_sessions`, `repair_step_progress`, `chat_messages`, `completed_repairs`, `repair_observations`, the storage bucket `repair-private-media`, and the quota function used by the edge function. Whether a given Supabase project has all migrations applied is checked with the S03 tooling, not by this README; see [docs/schema-comparison.md](docs/schema-comparison.md).
- **Do not change** the function contract, table or column names, or migrations as part of front-end or documentation work.

## Testing

```bash
npm test                  # 7 test files, runs once
npm run test:watch
npm run typecheck:tests
```

The tests describe how the app behaves **today** (routing, locale parity, V05, V07, V08, danger gates, service helpers). They use stand-ins for Supabase, edge functions, geolocation, media and `fetch`, and any real network request fails the test. They load no `.env` files. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#testing) for mock rules and what is not covered.

## Languages (i18n)

A small built-in system, no external library. `src/i18n/en.json` and `src/i18n/hi.json` must keep **identical keys** (currently 616 each) and the same `{placeholders}`; a test enforces this. Always use `t('group.key')`. The chosen language is stored in the browser and `<html lang>` follows it.

```tsx
import { t } from '../i18n'
<h1>{t('dashboard.title')}</h1>
```

Hindi safety wording is listed in [docs/v09-i18n-coverage.md](docs/v09-i18n-coverage.md) for human review.

## Design tokens

Defined in `src/index.css` (`@theme`). Dark theme.

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#041329` | Page background |
| `surface` / `surface-high` | `#112036` / `#1c2a41` | Cards and raised panels |
| `primary` | `#00f5d4` | Main actions and accents |
| `text-primary` / `text-secondary` | `#d6e3ff` / `#b9cac4` | Text |
| `warning` / `error` / `success` | `#ffd43b` / `#ffb4ab` / `#51cf66` | States (never colour alone) |

Fonts: Inter, plus Noto Sans Devanagari for Hindi (loaded from Google Fonts in `index.html`). Animations respect the reduced-motion setting.

## Camera troubleshooting

Camera access needs **HTTPS** (or `localhost`) and the user's permission. If the camera is unavailable, the user can upload a photo instead.

| Error | Cause | Fix |
|-------|-------|-----|
| `NotAllowedError` | Permission denied | Allow the camera in the browser's site settings |
| `NotFoundError` | No camera | Use a device with a camera or upload a photo |
| `NotReadableError` | Camera in use | Close other apps using the camera |
| `SecurityError` | Not HTTPS | Open the site over `https://` |

More notes: [CAMERA_TROUBLESHOOTING.md](CAMERA_TROUBLESHOOTING.md). The other root-level notes (`BLACK_SCREEN_FIX.md`, `CAMERA_FIX_SUMMARY.md`, `CAMERA_PERMISSION_FIX.md`, `QUICK_FIX_GUIDE.md`, `DEPLOYMENT_CHECKLIST.md`) are earlier working notes and have not been re-checked against the current code.

## Deployment

- **Frontend:** built for Vercel. `vercel.json` rewrites all paths to `index.html` (single-page app) and sets `Permissions-Policy` and `X-Content-Type-Options` headers. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Vercel project settings. Do not set `VITE_ENABLE_FIXTURES` to `true` there.
- **Backend:** with the Supabase CLI, `supabase link`, `supabase db push` for migrations (review [docs/migration-approval.md](docs/migration-approval.md) first), set the function secrets, then `supabase functions deploy analyze-image`.
- No other deployment targets exist in this repository.

## Documentation index

| Document | Content |
|----------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, boundaries, state, safety restrictions, backend contract, testing |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | Naming, errors, state and API rules |
| [docs/analysis-env.md](docs/analysis-env.md) | Edge function secret names and defaults |
| [docs/v09-i18n-coverage.md](docs/v09-i18n-coverage.md) | Locale coverage and Hindi safety strings |
| [docs/v09-device-accessibility-checklist.md](docs/v09-device-accessibility-checklist.md) | Manual device and accessibility checks |
| `docs/S01` to `docs/S04`, `docs/schema*`, `docs/rls-test-evidence.md`, `docs/provider-evaluation.md`, `docs/migration-approval.md` | Backend evidence reports |

## Contributing and license

Work on a branch, keep `npm run build`, `npm run lint`, `npm test` and `npm run typecheck:tests` passing, and follow [docs/CONVENTIONS.md](docs/CONVENTIONS.md). Do not change safety behavior, routes, storage keys or backend contracts without agreeing it first.

This project is private. All rights reserved.
