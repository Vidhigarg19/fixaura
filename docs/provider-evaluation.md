# Provider evaluation - Gemini API (S02)

Fill this after running `npx tsx scripts/s02-eval.ts` (results: docs/provider-evaluation-results.md).

## 1. Terms and privacy (re-checked before implementation)
- Date checked: ____  | Terms URL: https://ai.google.dev/gemini-api/terms
- Unpaid quota: Google may use submitted content/responses to improve its products, and human reviewers may read it. Do NOT submit sensitive, confidential or personal information. [ ] understood
- Users must be 18+; the app must not be directed at / likely accessed by under-18 users. [ ] reviewed
- EEA / Switzerland / UK end users require Paid Services. Pilot users are in: ____
- Billing activated on the Cloud project? ____ (changes how data is used - read the current terms)
- Decision: [ ] pilot with approved non-sensitive images only, with a visible notice  [ ] move to paid tier before real users

## 2. Limits seen in AI Studio for MY project (copy numbers, do not guess)
- Requests/minute: ____  Requests/day: ____  Model: ____  (screenshot saved: ____)
- ANALYSIS_GLOBAL_DAILY_LIMIT set to: ____ (must be below the daily number above)

## 3. Quality (from results file)
- Valid responses: __/__   Correct diagnosis (human judged): __/__   Typical latency: ____ ms
- Failures seen and their codes: ____

## 4. Decision
[ ] Keep this model  [ ] Try another model ID: ____  [ ] Not good enough yet - reason: ____
