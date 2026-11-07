/**
 * DEV-ONLY test hook. Returns a fixture name only when ALL of these hold:
 *  - the build is a development build (import.meta.env.DEV)
 *  - VITE_ENABLE_FIXTURES is exactly "true"
 *  - the URL has ?fixture=<name>
 * In a production build `import.meta.env.DEV` is replaced by `false`, so this always
 * returns null and every fixture branch that depends on it is removed.
 */
export function readFixtureName(): string | null {
  if (!import.meta.env.DEV) return null
  if (import.meta.env.VITE_ENABLE_FIXTURES !== 'true') return null
  const name = new URLSearchParams(window.location.search).get('fixture')
  return name ? name : null
}

/** Keeps ?fixture=... on in-app links while a fixture is active; otherwise a no-op. */
export function withFixtureQuery(path: string): string {
  const name = readFixtureName()
  return name ? `${path}?fixture=${encodeURIComponent(name)}` : path
}
