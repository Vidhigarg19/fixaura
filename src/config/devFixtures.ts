// DEV-ONLY entry points to the fixture modules in src/dev/.
//
// Why this file reads import.meta.env.DEV itself instead of importing `isDevBuild` from env.ts:
// the bundler replaces `import.meta.env.DEV` with a literal inside THIS module, so the
// `false ? () => import(...) : null` below is removed at transform time and the dev/ chunks are
// never emitted in a production build. A flag imported from another module is only inlined
// after chunks are planned, which would ship the fixture code. Keep the check and the import()
// in the same file. Everything else in the app imports these exports and must not call
// import('../dev/...') directly.
import { lazy } from 'react'

export const FixtureBanner = import.meta.env.DEV ? lazy(() => import('../dev/FixtureBanner')) : null

export const FixturePanel = import.meta.env.DEV ? lazy(() => import('../dev/FixturePanel')) : null

export const loadAnalysisFixtures = import.meta.env.DEV ? () => import('../dev/analysisFixtures') : null

export const loadSessionFixtures = import.meta.env.DEV ? () => import('../dev/sessionFixtures') : null
