// S02 tests: login, quota, fail-closed, safe logs. Koi live API call nahi.
// Run (repo root se):  npx tsx scripts/s02-tests.ts
import assert from 'node:assert/strict'
import { handleAnalyze, type HandlerDeps } from '../supabase/functions/analyze-image/handler.ts'
import {
  ConfigurationError,
  parsePositiveInt,
  providerErrorSummary,
  secondsUntilNextMinute,
  type QuotaResult,
} from '../supabase/functions/analyze-image/logic.ts'

const GOOD = {
  issueName: 'Loose hinge screw', confidence: 74, summary: 'Hinge looks misaligned.', severity: 'low',
  recommendedFix: 'Tighten the screws.', recommendedTools: ['Screwdriver'],
  nextStepAdvice: 'Re-check alignment.', safetyWarning: 'Unplug first.', explanation: 'Visible gap.',
}
const SECRET_IMAGE = 'U0VDUkVUX0lNQUdFX0JZVEVT'
const SECRET_TEXT = 'my private kitchen leaks near address 42'
const BODY = { imageBase64: SECRET_IMAGE, mediaType: 'image/jpeg', description: SECRET_TEXT }

let providerCalls = 0
const okProvider = (async () => {
  providerCalls += 1
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(GOOD) }] } }] }), { status: 200 })
}) as unknown as typeof fetch

function deps(over: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    apiKey: 'k', model: 'm', fetchFn: okProvider, timeoutMs: 2000,
    identifyUser: async () => 'user-1234567890',
    consumeQuota: async () => 'ok',
    limits: { userPerMinute: 3, userPerDay: 10, globalPerDay: 200 },
    now: () => new Date('2026-11-08T10:15:20Z'),
    ...over,
  }
}
const req = (body: unknown = BODY) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) })
async function run(name: string, fn: () => Promise<void>) {
  providerCalls = 0
  await fn()
  console.log('PASS', name)
}
const errorOf = async (res: Response) => (await res.json()).error

await run('no valid login -> unauthenticated (401), provider NOT called', async () => {
  const res = await handleAnalyze(req(), deps({ identifyUser: async () => null }))
  assert.equal(res.status, 401)
  assert.deepEqual(await errorOf(res), { code: 'unauthenticated', retryable: false })
  assert.equal(providerCalls, 0)
})

await run('auth service down -> service_unavailable; missing config -> configuration_error', async () => {
  const down = await handleAnalyze(req(), deps({ identifyUser: async () => { throw new Error('down') } }))
  assert.equal(down.status, 503)
  const cfg = await handleAnalyze(req(), deps({ identifyUser: async () => { throw new ConfigurationError('missing key') } }))
  assert.equal(cfg.status, 500)
  assert.equal((await errorOf(cfg)).code, 'configuration_error')
  assert.equal(providerCalls, 0)
})

await run('per-minute limit -> rate_limited with trusted retryAfterSeconds + header', async () => {
  const res = await handleAnalyze(req(), deps({ consumeQuota: async () => 'user_minute' }))
  assert.equal(res.status, 429)
  assert.deepEqual(await errorOf(res.clone()), { code: 'rate_limited', retryable: true, retryAfterSeconds: 40 })
  assert.equal(res.headers.get('Retry-After'), '40')
  assert.equal(providerCalls, 0)
})

await run('daily user / global limit -> quota_exceeded, no countdown', async () => {
  for (const q of ['user_day', 'global_day'] as QuotaResult[]) {
    const res = await handleAnalyze(req(), deps({ consumeQuota: async () => q }))
    assert.equal(res.status, 429)
    assert.deepEqual(await errorOf(res.clone()), { code: 'quota_exceeded', retryable: false })
    assert.equal(res.headers.get('Retry-After'), null)
  }
  assert.equal(providerCalls, 0)
})

await run('quota store failure -> fail closed (provider NOT called)', async () => {
  const res = await handleAnalyze(req(), deps({ consumeQuota: async () => { throw new Error('db down') } }))
  assert.equal(res.status, 503)
  assert.equal((await errorOf(res)).code, 'service_unavailable')
  assert.equal(providerCalls, 0)
})

await run('invalid input does NOT consume quota', async () => {
  let consumed = 0
  const res = await handleAnalyze(req({ ...BODY, description: '' }), deps({ consumeQuota: async () => { consumed += 1; return 'ok' } }))
  assert.equal(res.status, 400)
  assert.equal(consumed, 0)
})

await run('success consumes quota once with the VERIFIED user id', async () => {
  const seen: string[] = []
  const res = await handleAnalyze(
    req({ ...BODY, user_id: 'attacker-id' }),
    deps({ consumeQuota: async (id) => { seen.push(id); return 'ok' } })
  )
  assert.equal(res.status, 200)
  assert.deepEqual(seen, ['user-1234567890'])
  assert.equal(providerCalls, 1)
})

await run('logs never contain image, description, api key or full user id', async () => {
  const lines: string[] = []
  const origLog = console.log, origErr = console.error
  console.log = (...a: unknown[]) => { lines.push(a.join(' ')) }
  console.error = (...a: unknown[]) => { lines.push(a.join(' ')) }
  try {
    await handleAnalyze(req(), deps({ apiKey: 'SUPER_SECRET_KEY' }))
    await handleAnalyze(req(), deps({ apiKey: 'SUPER_SECRET_KEY', fetchFn: (async () => new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } }), { status: 429 })) as unknown as typeof fetch }))
    await handleAnalyze(req(), deps({ consumeQuota: async () => 'user_day' }))
  } finally {
    console.log = origLog
    console.error = origErr
  }
  const all = lines.join('\n')
  assert.ok(lines.length >= 3, 'expected structured log lines')
  for (const forbidden of [SECRET_IMAGE, SECRET_TEXT, 'SUPER_SECRET_KEY', 'user-1234567890']) {
    assert.ok(!all.includes(forbidden), `log leaked: ${forbidden}`)
  }
  assert.ok(all.includes('"user":"user-123"'), 'only a short user ref is logged')
  assert.ok(all.includes('RESOURCE_EXHAUSTED'), 'provider status is logged for diagnosis')
})

await run('helpers: limits parsing, retry seconds, provider summary', async () => {
  assert.equal(parsePositiveInt(undefined, 10, 1, 100), 10)
  assert.equal(parsePositiveInt('abc', 10, 1, 100), 10)
  assert.equal(parsePositiveInt('0', 10, 1, 100), 1)
  assert.equal(parsePositiveInt('5000', 10, 1, 100), 100)
  assert.equal(parsePositiveInt('7', 10, 1, 100), 7)
  assert.equal(secondsUntilNextMinute(new Date('2026-11-08T10:15:00Z')), 60)
  assert.equal(secondsUntilNextMinute(new Date('2026-11-08T10:15:59Z')), 1)
  assert.deepEqual(providerErrorSummary(JSON.stringify({ error: { status: 'X', message: 'm' } })), { providerStatus: 'X', message: 'm' })
  assert.deepEqual(providerErrorSummary('not json'), {})
})

console.log('\nAll S02 tests passed.')
