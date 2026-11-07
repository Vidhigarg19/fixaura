// S04: ek hi jagah user verification, har Edge Function yahi use kare.
// Rule: user id SIRF verified JWT se aata hai, request body ke user_id par kabhi bharosa nahi.
import { ConfigurationError } from './errors.ts'

export interface AuthClientLike {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id: string } | null }
      error: { status?: number; name?: string } | null
    }>
  }
}

export interface AuthDeps {
  url: string | undefined
  anonKey: string | undefined
  // method syntax on purpose (bivariant) so the real supabase-js createClient is assignable
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createClient(url: string, key: string, options?: any): AuthClientLike
}

export function extractBearerToken(request: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec((request.headers.get('Authorization') ?? '').trim())
  const token = match?.[1]?.trim()
  return token ? token : null
}

// Returns: user id (valid session) | null (no / invalid / expired token)
// Throws: ConfigurationError (missing env) or Error (auth service itself is down).
export function createUserIdentifier(deps: AuthDeps) {
  return async function identifyUser(request: Request): Promise<string | null> {
    if (!deps.url || !deps.anonKey) throw new ConfigurationError('missing SUPABASE_URL or anon key')
    const token = extractBearerToken(request)
    if (!token) return null

    const client = deps.createClient(deps.url, deps.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await client.auth.getUser(token)
    if (error) {
      // Network / 5xx = auth service ka masla (user ki galti nahi). Baaki sab = invalid/expired session.
      if (error.name === 'AuthRetryableFetchError' || (error.status ?? 0) >= 500) {
        throw new Error('auth service unavailable')
      }
      return null
    }
    return data.user?.id ?? null
  }
}
