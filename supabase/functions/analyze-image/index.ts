import { createClient } from 'npm:@supabase/supabase-js@2'
import { createUserIdentifier } from '../_shared/auth.ts'
import { handleAnalyze } from './handler.ts'
import {
  ConfigurationError,
  DEFAULT_LIMITS,
  parsePositiveInt,
  type QuotaLimits,
  type QuotaResult,
} from './logic.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

// Model env-configurable: `supabase secrets set GEMINI_MODEL=...`
const DEFAULT_MODEL = 'gemini-3.5-flash-lite'
const env = (name: string) => Deno.env.get(name)

// SUPABASE_* secrets auto-injected hote hain. Agar kisi wajah se na milein to APP_* fallback
// (SUPABASE_ prefix wale secrets CLI se set nahi ho sakte, isliye alag naam).
const SUPABASE_URL = env('SUPABASE_URL')
const ANON_KEY = env('SUPABASE_ANON_KEY') ?? env('APP_SUPABASE_ANON_KEY')
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY') ?? env('APP_SUPABASE_SERVICE_ROLE_KEY')

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }

const identifyUser = createUserIdentifier({ url: SUPABASE_URL, anonKey: ANON_KEY, createClient })

async function consumeQuota(userId: string, limits: QuotaLimits): Promise<QuotaResult> {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new ConfigurationError('missing SUPABASE_URL or service key')
  const client = createClient(SUPABASE_URL, SERVICE_KEY, clientOptions)
  const { data, error } = await client.rpc('consume_analysis_quota', {
    p_user: userId,
    p_minute_limit: limits.userPerMinute,
    p_user_day_limit: limits.userPerDay,
    p_global_day_limit: limits.globalPerDay,
  })
  if (error) {
    console.error('quota rpc failed', error.code, error.message)
    throw new Error('quota store error')
  }
  if (data === 'ok' || data === 'user_minute' || data === 'user_day' || data === 'global_day') return data
  throw new Error('unexpected quota response')
}

Deno.serve((request) =>
  handleAnalyze(request, {
    apiKey: env('GEMINI_API_KEY'),
    model: env('GEMINI_MODEL') ?? DEFAULT_MODEL,
    fetchFn: fetch,
    timeoutMs: parsePositiveInt(env('ANALYSIS_TIMEOUT_MS'), 25_000, 5_000, 60_000),
    identifyUser,
    consumeQuota,
    limits: {
      userPerMinute: parsePositiveInt(env('ANALYSIS_USER_PER_MINUTE_LIMIT'), DEFAULT_LIMITS.userPerMinute, 1, 60),
      userPerDay: parsePositiveInt(env('ANALYSIS_USER_DAILY_LIMIT'), DEFAULT_LIMITS.userPerDay, 1, 1000),
      globalPerDay: parsePositiveInt(env('ANALYSIS_GLOBAL_DAILY_LIMIT'), DEFAULT_LIMITS.globalPerDay, 1, 100_000),
    },
    now: () => new Date(),
  })
)
