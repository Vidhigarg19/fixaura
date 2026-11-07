import { handleAnalyze, type HandlerDeps } from './handler.ts'
import {
  containsDanger,
  mapProviderFailure,
  validateDiagnosis,
  validateDiagnosisRequest,
  validateVerification,
} from './logic.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const jpeg = '/9j/4AAQSkZJRg=='
const diagnosis = {
  issueName: 'Loose cabinet hinge',
  confidence: 82,
  summary: 'The hinge appears loose.',
  severity: 'low',
  recommendedFix: 'Tighten the hinge screws.',
  recommendedTools: ['Screwdriver'],
  nextStepAdvice: 'Support the door while tightening.',
  safetyWarning: 'Keep fingers clear of the hinge.',
  explanation: 'The hinge is visibly displaced.',
}

function makeRequest(body: unknown) {
  return new Request('https://homegenie.test/functions/v1/analyze-image', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-user-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function dependencies(
  fetchFn: typeof fetch,
  apiKey: string | undefined = 'test-gemini-key'
): HandlerDeps {
  return {
    apiKey,
    model: 'gemini-3.1-flash-lite',
    supabaseUrl: 'https://project.supabase.co',
    supabaseKey: 'test-anon-key',
    fetchFn,
    timeoutMs: 1000,
  }
}

function authOnlyFetch(status = 200): typeof fetch {
  return async () => new Response('{}', { status })
}

Deno.test('validates JPEG, PNG, and WebP signatures and rejects mismatched image data', () => {
  const png = 'iVBORw0KGgo='
  const webp = 'UklGRgAAAABXRUJQ'
  assert(
    validateDiagnosisRequest({ imageBase64: jpeg, mediaType: 'image/jpeg', description: 'Loose hinge' }),
    'JPEG should validate'
  )
  assert(
    validateDiagnosisRequest({ imageBase64: png, mediaType: 'image/png', description: 'Loose hinge' }),
    'PNG should validate'
  )
  assert(
    validateDiagnosisRequest({ imageBase64: webp, mediaType: 'image/webp', description: 'Loose hinge' }),
    'WebP should validate'
  )
  assert(
    !validateDiagnosisRequest({ imageBase64: jpeg, mediaType: 'image/png', description: 'Loose hinge' }),
    'Mismatched media type should fail'
  )
  assert(
    !validateDiagnosisRequest({ imageBase64: 'not-base64', mediaType: 'image/jpeg', description: 'Loose hinge' }),
    'Malformed base64 should fail'
  )
  assert(
    !validateDiagnosisRequest({ imageBase64: jpeg, mediaType: 'image/gif', description: 'Loose hinge' }),
    'Unsupported image type should fail'
  )
})

Deno.test('validates all diagnosis fields and rejects dangerous or contradictory output', () => {
  assert(validateDiagnosis(diagnosis), 'Complete diagnosis should validate')
  assert(
    !validateDiagnosis({ ...diagnosis, confidence: 101 }),
    'Out-of-range confidence should fail'
  )
  const hazardous = validateDiagnosis({
    ...diagnosis,
    issueName: 'Exposed live electrical wires',
    recommendedFix: 'Do not touch them.',
  })
  assert(hazardous?.safetyStop === true, 'Electrical hazard should engage Safety Stop')
  assert(hazardous.recommendedTools.length === 0, 'Safety Stop should not recommend tools')
  assert(containsDanger('I smell gas near the stove'), 'Gas odor should be detected')
  assert(containsDanger('The outlet sparks when switched on'), 'Electrical sparks should be detected')
  assert(containsDanger('Smoke is coming from the appliance'), 'Smoke should be detected')
})

Deno.test('rejects invalid verification and resolved status with a failed check', () => {
  assert(
    validateVerification({
      status: 'resolved',
      summary: 'The repair appears complete.',
      checks: [{ label: 'No visible damage', passed: true }],
      nextAdvice: 'Monitor operation.',
    }),
    'Complete verification should validate'
  )
  assert(
    !validateVerification({
      status: 'resolved',
      summary: 'The repair appears complete.',
      checks: [{ label: 'Leak remains', passed: false }],
      nextAdvice: 'Call a plumber.',
    }),
    'Resolved status with a failed check must fail validation'
  )
  const hazardous = validateVerification({
    status: 'resolved',
    summary: 'Exposed live wires remain.',
    checks: [{ label: 'Wires secure', passed: true }],
    nextAdvice: 'Continue use.',
  })
  assert(hazardous?.status === 'professional', 'Hazardous verification must require a professional')
  assert(hazardous.checks.every((check) => !check.passed), 'Safety Stop checks must not pass')
})

Deno.test('classifies rate limits and quota errors without exposing provider messages', () => {
  assert(
    mapProviderFailure(429, '{"error":{"message":"Too many requests"}}', null).code === 'rate_limited',
    'Transient 429 should be rate_limited'
  )
  assert(
    mapProviderFailure(429, '{"error":{"message":"Daily quota exceeded"}}', null).code === 'quota_exceeded',
    'Exhausted quota should be quota_exceeded'
  )
})

Deno.test('rejects unauthenticated callers before contacting Gemini', async () => {
  let calls = 0
  const response = await handleAnalyze(
    new Request('https://homegenie.test/functions/v1/analyze-image', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
    dependencies(async () => {
      calls += 1
      return new Response('{}')
    })
  )
  const payload = await response.json()
  assert(response.status === 401, 'Missing bearer token should be unauthorized')
  assert(payload.error.code === 'unauthenticated', 'Unauthenticated error code should be returned')
  assert(calls === 0, 'Unauthenticated call must not contact downstream services')
})

Deno.test('returns a validated Gemini diagnosis using the server-side key', async () => {
  let providerCalled = false
  const fetchFn: typeof fetch = async (input, init) => {
    if (String(input).includes('/auth/v1/user')) return new Response('{}')
    providerCalled = true
    const headers = new Headers(init?.headers)
    assert(headers.get('x-goog-api-key') === 'test-gemini-key', 'Gemini key should be sent server-side')
    return Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify(diagnosis) }] } }],
    })
  }
  const response = await handleAnalyze(
    makeRequest({ imageBase64: jpeg, mediaType: 'image/jpeg', description: 'Loose hinge' }),
    dependencies(fetchFn)
  )
  const payload = await response.json()
  assert(response.status === 200 && payload.ok === true, 'Diagnosis should succeed')
  assert(payload.data.issueName === diagnosis.issueName, 'Actual model diagnosis should be returned')
  assert(providerCalled, 'Provider should be called for a non-hazard diagnosis')
})

Deno.test('returns a professional Safety Stop for a gas hazard without Gemini', async () => {
  const response = await handleAnalyze(
    makeRequest({
      imageBase64: jpeg,
      mediaType: 'image/jpeg',
      description: 'I smell gas near the water heater.',
    }),
    dependencies(authOnlyFetch(), '')
  )
  const payload = await response.json()
  assert(response.status === 200 && payload.ok, 'Gas hazard should produce safety guidance')
  assert(payload.data.safetyStop === true, 'Safety Stop flag should be set')
  assert(payload.data.recommendedTools.length === 0, 'Safety Stop should provide no DIY tool list')
})

Deno.test('returns configuration error for missing Gemini key and a retryable timeout', async () => {
  const missingKeyResponse = await handleAnalyze(
    makeRequest({ imageBase64: jpeg, mediaType: 'image/jpeg', description: 'Loose hinge' }),
    dependencies(authOnlyFetch(), '')
  )
  const missingKeyPayload = await missingKeyResponse.json()
  assert(missingKeyPayload.ok === false, 'Missing key must not return success')
  assert(missingKeyPayload.error.code === 'configuration_error', 'Missing key should be explicit')

  const timeoutFetch: typeof fetch = async (input, init) => {
    if (String(input).includes('/auth/v1/user')) return new Response('{}')
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })
  }
  const timeoutResponse = await handleAnalyze(
    makeRequest({ imageBase64: jpeg, mediaType: 'image/jpeg', description: 'Loose hinge' }),
    { ...dependencies(timeoutFetch), timeoutMs: 1 }
  )
  const timeoutPayload = await timeoutResponse.json()
  assert(timeoutResponse.status === 504, 'Provider timeout should return gateway timeout')
  assert(timeoutPayload.ok === false && timeoutPayload.error.retryable, 'Timeout should remain a retryable failure')
})

Deno.test('supports verified repair responses and rejects raw provider errors', async () => {
  const verification = {
    status: 'resolved',
    summary: 'The hinge is secure.',
    checks: [{ label: 'Hinge is aligned', passed: true }],
    nextAdvice: 'Monitor the hinge.',
  }
  let providerCall = 0
  const successFetch: typeof fetch = async (input) => {
    if (String(input).includes('/auth/v1/user')) return new Response('{}')
    providerCall += 1
    return Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify(verification) }] } }],
    })
  }
  const verificationResponse = await handleAnalyze(
    makeRequest({
      mode: 'verify',
      afterImage: { imageBase64: jpeg, mediaType: 'image/jpeg' },
      issueName: 'Loose cabinet hinge',
      description: 'The hinge was tightened.',
      stepsSummary: 'Tighten hinge screws.',
      locale: 'en',
    }),
    dependencies(successFetch)
  )
  const verificationPayload = await verificationResponse.json()
  assert(verificationPayload.ok && verificationPayload.data.status === 'resolved', 'Verification mode should return validated status')
  assert(providerCall === 1, 'Verification mode should call Gemini')

  const failureFetch: typeof fetch = async (input) => {
    if (String(input).includes('/auth/v1/user')) return new Response('{}')
    return new Response(
      '{"error":{"message":"private provider failure text","status":"RESOURCE_EXHAUSTED"}}',
      { status: 429 }
    )
  }
  const failureResponse = await handleAnalyze(
    makeRequest({ imageBase64: jpeg, mediaType: 'image/jpeg', description: 'Loose hinge' }),
    dependencies(failureFetch)
  )
  const failureText = await failureResponse.text()
  assert(failureResponse.status === 429, 'Provider quota/rate status should be represented')
  assert(failureText.includes('"ok":false'), 'Provider failure should use error contract')
  assert(!failureText.includes('private provider failure text'), 'Provider text must not reach clients')
})
