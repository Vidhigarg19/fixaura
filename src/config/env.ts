// The ONLY file in src/ that reads import.meta.env. Everything else imports from here.
// (docs/CONVENTIONS.md, "API and service layer"; docs/ARCHITECTURE.md, "Environment and configuration".)
//
// Rules:
// - Names only are documented; values come from .env.local, Vercel or the build tool.
// - Nothing here throws. A module that needs a value decides what to do when it is missing
//   (src/lib/supabase.ts throws a clear error at import, as before).
// - Keep `isDevBuild` a direct `import.meta.env.DEV` constant. Vite replaces it with a literal,
//   which lets a production build drop every dev-only branch and the dev/ fixture modules.

/** True only in a development build. Replaced by a literal at build time. */
export const isDevBuild: boolean = import.meta.env.DEV

/** True when VITE_ENABLE_FIXTURES is exactly "true". Only meaningful together with isDevBuild. */
export const fixturesFlagEnabled: boolean = import.meta.env.VITE_ENABLE_FIXTURES === 'true'

export interface AppEnv {
  /** Supabase project URL (VITE_SUPABASE_URL). */
  readonly supabaseUrl: string | undefined
  /** Supabase publishable (client-safe) key (VITE_SUPABASE_PUBLISHABLE_KEY). */
  readonly supabasePublishableKey: string | undefined
  readonly isDev: boolean
  readonly fixturesFlagEnabled: boolean
}

export const env: AppEnv = Object.freeze({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
  isDev: isDevBuild,
  fixturesFlagEnabled,
})
