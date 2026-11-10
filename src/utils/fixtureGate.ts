import { fixturesFlagEnabled, isDevBuild } from '../config/env'

/**
 * DEV-ONLY test hook. Returns a fixture name only when ALL of these hold:
 *  - the build is a development build (import.meta.env.DEV)
 *  - VITE_ENABLE_FIXTURES is exactly "true"
 *  - the URL has ?fixture=<name>
 * In a production build `import.meta.env.DEV` is replaced by `false`, so this always
 * returns null and every fixture branch that depends on it is removed.
 */
export function readFixtureName(): string | null {
  if (!isDevBuild) return null
  if (!fixturesFlagEnabled) return null
  const name = new URLSearchParams(window.location.search).get('fixture')
  return name ? name : null
}

export function readFixtureParams(): { name: string; delaySeconds: number } | null {
  if (!isDevBuild) return null
  if (!fixturesFlagEnabled) return null
  const params = new URLSearchParams(window.location.search)
  const name = params.get('fixture')
  if (!name) return null
  const delay = Number(params.get('delay') ?? '0')
  return { name, delaySeconds: Number.isFinite(delay) ? delay : 0 }
}

/** Keeps ?fixture=... on in-app links while a fixture is active; otherwise a no-op. */
export function withFixtureQuery(path: string): string {
  const name = readFixtureName()
  return name ? `${path}?fixture=${encodeURIComponent(name)}` : path
}
