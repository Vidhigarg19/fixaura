// S01 tests: provider ko mock karte hain, koi live API call nahi hoti.
// Run (repo root se):  npx tsx scripts/s01-tests.ts
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { handleAnalyze, type HandlerDeps } from '../supabase/functions/analyze-image/handler.ts'
import { mapProviderFailure } from '../supabase/functions/analyze-image/logic.ts'
import { diagnosisFromEnvelope, errorFromEnvelope } from '../src/services/analysisContract'
import { AnalysisError } from '../src/types/analysis'

const GOOD_DIAGNOSIS = {
  issueName: 'Loose hinge screw',
  confidence: 74,
  summary: 'The hinge looks slightly misaligned; the photo is a little blurry.',
  severity: 'low',
  recommendedFix: 'Tighten the hinge screws with a screwdriver.',
  recommendedTools: ['Screwdriver'],
  nextStepAdvice: 'Check the door alignment after tightening.',
  safetyWarning: 'Unplug the appliance before working on it.',
  explanation: 'Visible gap near the upper hinge suggests loose fasteners.',
}

const providerOk = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })
const providerError = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

function deps(fetchFn: typeof fetch, over: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    apiKey: 'test-key',
    model: 'test-model',
    fetchFn,
    timeoutMs: 2000,
    identifyUser: async () => 'user-1234567890',
    consumeQuota: async () => 'ok',
    limits: { userPerMinute: 3, userPerDay: 10, globalPerDay: 200 },
    now: () => new Date('2026-11-08T10:15:20Z'),
    ...over,
  }
}
const req = (body: unknown, method = 'POST') =>
  new Request('http://local/analyze-image', {
    method,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
const VALID_BODY = { imageBase64: 'QUJD', mediaType: 'image/jpeg', description: 'it is broken' }

async function run(name: string, fn: () => Promise<void>) {
  await fn()
  console.log('PASS', name)
}

const fixtures: Record<string, unknown> = {}
async function capture(name: string, res: Response) {
  const body = await res.clone().json()
  fixtures[name] = { httpStatus: res.status, retryAfterHeader: res.headers.get('Retry-After'), body }
}

await run('success returns { ok:true, data }', async () => {
  const res = await handleAnalyze(req(VALID_BODY), deps(async () => providerOk(JSON.stringify(GOOD_DIAGNOSIS))))
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.equal(json.ok, true)
  assert.equal(json.data.issueName, 'Loose hinge screw')
  await capture('success', providerOkClone())
  function providerOkClone() {
    return new Response(JSON.stringify(json), { status: 200 })
  }
})

await run('missing configuration -> configuration_error (500)', async () => {
  const res = await handleAnalyze(req(VALID_BODY), deps(async () => providerOk('{}'), { apiKey: undefined }))
  assert.equal(res.status, 500)
  assert.equal((await res.clone().json()).error.code, 'configuration_error')
  await capture('configuration_error', res)
})

await run('invalid input (empty description) -> invalid_input (400)', async () => {
  const res = await handleAnalyze(req({ ...VALID_BODY, description: '  ' }), deps(async () => providerOk('{}')))
  assert.equal(res.status, 400)
  assert.equal((await res.clone().json()).error.code, 'invalid_input')
  await capture('invalid_input', res)
})

await run('bad media type / bad JSON / wrong method', async () => {
  const bad = await handleAnalyze(req({ ...VALID_BODY, mediaType: 'image/gif' }), deps(async () => providerOk('{}')))
  assert.equal(bad.status, 400)
  const notJson = await handleAnalyze(new Request('http://x', { method: 'POST', body: 'not json' }), deps(async () => providerOk('{}')))
  assert.equal(notJson.status, 400)
  const get = await handleAnalyze(req(null, 'GET'), deps(async () => providerOk('{}')))
  assert.equal(get.status, 405)
  const options = await handleAnalyze(req(null, 'OPTIONS'), deps(async () => providerOk('{}')))
  assert.equal(options.status, 200)
})

await run('provider 429 with retry info -> rate_limited + Retry-After', async () => {
  const body = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded per minute', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '34s' }] } }
  const res = await handleAnalyze(req(VALID_BODY), deps(async () => providerError(429, body)))
  assert.equal(res.status, 429)
  const json = await res.clone().json()
  assert.deepEqual(json.error, { code: 'rate_limited', retryable: true, retryAfterSeconds: 34 })
  assert.equal(res.headers.get('Retry-After'), '34')
  await capture('rate_limited', res)
})

await run('provider 429 daily quota -> quota_exceeded, no fake countdown', async () => {
  const body = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota per day', details: [{ retryDelay: '20s' }] } }
  const res = await handleAnalyze(req(VALID_BODY), deps(async () => providerError(429, body)))
  const json = await res.clone().json()
  assert.deepEqual(json.error, { code: 'quota_exceeded', retryable: false })
  assert.equal(res.headers.get('Retry-After'), null)
  await capture('quota_exceeded', res)
})

await run('timeout -> service_unavailable (504, retryable)', async () => {
  const hang = ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as unknown as typeof fetch
  const res = await handleAnalyze(req(VALID_BODY), deps(hang, { timeoutMs: 50 }))
  assert.equal(res.status, 504)
  const json = await res.clone().json()
  assert.deepEqual(json.error, { code: 'service_unavailable', retryable: true })
  await capture('timeout', res)
})

await run('network failure and provider 500 -> service_unavailable (503)', async () => {
  const net = await handleAnalyze(req(VALID_BODY), deps((async () => { throw new TypeError('network down') }) as typeof fetch))
  assert.equal(net.status, 503)
  const five = await handleAnalyze(req(VALID_BODY), deps(async () => providerError(500, { error: { message: 'boom' } })))
  assert.equal(five.status, 503)
  assert.equal((await five.json()).error.retryable, true)
})

await run('invalid model output -> invalid_response (502), never a mock diagnosis', async () => {
  const notJson = await handleAnalyze(req(VALID_BODY), deps(async () => providerOk('sorry I cannot help')))
  assert.equal(notJson.status, 502)
  const partial = await handleAnalyze(req(VALID_BODY), deps(async () => providerOk(JSON.stringify({ issueName: 'x' }))))
  assert.equal(partial.status, 502)
  const badSeverity = await handleAnalyze(req(VALID_BODY), deps(async () => providerOk(JSON.stringify({ ...GOOD_DIAGNOSIS, severity: 'extreme' }))))
  assert.equal(badSeverity.status, 502)
  assert.equal((await partial.clone().json()).ok, false)
  await capture('invalid_response', partial)
})

await run('empty provider output (blocked) -> invalid_response not retryable', async () => {
  const res = await handleAnalyze(req(VALID_BODY), deps(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })))
  assert.equal(res.status, 502)
  assert.equal((await res.json()).error.retryable, false)
})

await run('provider auth/model/key problems -> configuration_error', async () => {
  assert.equal(mapProviderFailure(403, '{}', null).code, 'configuration_error')
  assert.equal(mapProviderFailure(404, '{}', null).code, 'configuration_error')
  assert.equal(mapProviderFailure(400, JSON.stringify({ error: { message: 'API key not valid' } }), null).code, 'configuration_error')
  assert.equal(mapProviderFailure(400, JSON.stringify({ error: { message: 'bad image' } }), null).code, 'invalid_input')
  assert.equal(mapProviderFailure(429, '{}', '12').retryAfterSeconds, 12)
})

await run('client contract: success, defensive ok:false, garbage', async () => {
  const ok = diagnosisFromEnvelope({ ok: true, data: GOOD_DIAGNOSIS })
  assert.equal(ok.issueName, 'Loose hinge screw')
  assert.throws(() => diagnosisFromEnvelope({ ok: false, error: { code: 'rate_limited', retryable: true, retryAfterSeconds: 5 } }),
    (e: unknown) => e instanceof AnalysisError && e.code === 'rate_limited' && e.retryAfterSeconds === 5)
  for (const garbage of [null, 'x', {}, { ok: true }, { ok: true, data: { issueName: 'x' } }, GOOD_DIAGNOSIS]) {
    assert.throws(() => diagnosisFromEnvelope(garbage), (e: unknown) => e instanceof AnalysisError && e.code === 'invalid_response')
  }
  assert.equal(errorFromEnvelope(null), null)
  assert.equal(errorFromEnvelope({ ok: false, error: { code: 'made_up' } }), null)
})

mkdirSync('docs/api-contract', { recursive: true })
writeFileSync('docs/api-contract/analyze-image-fixtures.json', JSON.stringify(fixtures, null, 2) + '\n')
console.log('\nAll S01 tests passed. Fixtures written to docs/api-contract/analyze-image-fixtures.json')
