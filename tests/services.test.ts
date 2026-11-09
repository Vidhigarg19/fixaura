import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocale, localizedErrorMessage, setLocale, t } from '../src/i18n'
import { functionsInvoke, resetSupabaseMock } from './helpers/supabaseMock'
import { makeDiagnosis } from './helpers/fixtures'
import {
  buildExternalSearchUrl,
  findNearbyShops,
  isValidArea,
  normalizeWebsite,
  NearbySearchError,
} from '../src/services/nearbyShops'
import {
  clearSession,
  getSession,
  isValidDiagnosisResult,
  isValidDiagnosisSession,
  saveSession,
  setDiagnosis,
} from '../src/services/repairSession'
import { isValidSessionId } from '../src/services/sessionResume'
import {
  diagnosisFromEnvelope,
  errorFromEnvelope,
  observationFromEnvelope,
} from '../src/services/analysisContract'
import { analyzeImage } from '../src/services/visionAI'
import { askAssistant } from '../src/services/assistantService'
import { AnalysisError } from '../src/types/analysis'
import { validateDescription, validateImageFile, fitWithin } from '../src/utils/captureValidation'
import { clearCaptureDraft, loadCaptureDraft, saveCaptureDraft } from '../src/utils/captureDraft'
import { isNetworkError, isOffline } from '../src/utils/networkError'
import { authErrorMessage } from '../src/utils/authError'

vi.mock('../src/lib/supabase', async () => ({ supabase: (await import('./helpers/supabaseMock')).supabase }))

// Service and helper behaviour that can be checked with no network: fetch, Supabase and
// the edge function are stubs, and storage is jsdom's in-memory storage.

beforeEach(() => {
  resetSupabaseMock()
})

describe('nearbyShops helpers', () => {
  it('accepts a normal city or area and rejects bad text', () => {
    expect(isValidArea('Indiranagar, Bengaluru')).toBe(true)
    expect(isValidArea('  ab  ')).toBe(true)
    expect(isValidArea('a')).toBe(false)
    expect(isValidArea('x'.repeat(81))).toBe(false)
    expect(isValidArea('<script>')).toBe(false)
    expect(isValidArea('line\nbreak')).toBe(false)
  })

  it('builds a Google Maps search link; a typed area wins over coordinates', () => {
    const withArea = buildExternalSearchUrl('tap repair', 'Pune', { latitude: 18.5204, longitude: 73.8567 })
    const query = new URL(withArea).searchParams.get('query')
    expect(withArea.startsWith('https://www.google.com/maps/search/?api=1')).toBe(true)
    expect(query).toBe('tap repair Pune')

    const withCoordinates = buildExternalSearchUrl('tap repair', '', { latitude: 18.52043, longitude: 73.85674 })
    expect(new URL(withCoordinates).searchParams.get('query')).toBe('tap repair 18.520,73.857')
  })

  it('limits the search text to 200 characters', () => {
    const url = buildExternalSearchUrl('x'.repeat(300), '', null)
    expect((new URL(url).searchParams.get('query') ?? '').length).toBe(200)
  })

  it('only keeps safe http(s) website links', () => {
    expect(normalizeWebsite('example.com')).toBe('https://example.com/')
    expect(normalizeWebsite('http://shop.example.com/a')).toBe('http://shop.example.com/a')
    expect(normalizeWebsite('javascript:alert(1)')).toBe('')
    expect(normalizeWebsite('https://user:pw@example.com')).toBe('')
    expect(normalizeWebsite('localhost')).toBe('')
    expect(normalizeWebsite(undefined)).toBe('')
  })
})

describe('findNearbyShops (fetch is a stub)', () => {
  const fetchStub = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>
  const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

  it('rejects impossible input before any request is made', async () => {
    await expect(findNearbyShops(120, 0, 5)).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(findNearbyShops(10, 10, 0)).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(findNearbyShops(10, 10, 50)).rejects.toMatchObject({ code: 'invalid_input' })
    expect(fetchStub()).not.toHaveBeenCalled()
  })

  it('rejects with "cancelled" for an already-aborted signal and sends nothing', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(findNearbyShops(10, 10, 5, controller.signal)).rejects.toMatchObject({ code: 'cancelled' })
    expect(fetchStub()).not.toHaveBeenCalled()
  })

  it('turns directory elements into shops sorted by distance, dropping nameless or out-of-range ones', async () => {
    fetchStub().mockResolvedValue(
      okResponse({
        elements: [
          { type: 'node', id: 2, lat: 20.012, lon: 70.0, tags: { name: 'Far Shop', shop: 'hardware' } },
          { type: 'node', id: 1, lat: 20.001, lon: 70.0, tags: { name: 'Near Repair', craft: 'electrician', phone: '+91 99999 11111; +91 88888 22222' } },
          { type: 'node', id: 3, lat: 20.002, lon: 70.0, tags: { shop: 'appliance' } },
          { type: 'node', id: 4, lat: 25, lon: 80, tags: { name: 'Too Far', shop: 'appliance' } },
        ],
      })
    )
    const shops = await findNearbyShops(20, 70, 5)
    expect(shops.map((shop) => shop.name)).toEqual(['Near Repair', 'Far Shop'])
    expect(shops[0].type).toBe('repair')
    expect(shops[0].phone).toBe('+91 99999 11111')
    expect(shops[1].type).toBe('sell')
    const [url, init] = fetchStub().mock.calls[0] as [string, { method: string }]
    expect(url).toBe('https://overpass-api.de/api/interpreter')
    expect(init.method).toBe('POST')
  })

  it('tries the second directory server when the first is busy, then reports "busy"', async () => {
    fetchStub().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    await expect(findNearbyShops(21, 71, 5)).rejects.toMatchObject({ name: 'NearbySearchError', code: 'busy' })
    expect(fetchStub()).toHaveBeenCalledTimes(2)
    const hosts = fetchStub().mock.calls.map((call) => new URL(call[0] as string).host)
    expect(hosts).toEqual(['overpass-api.de', 'overpass.kumi.systems'])
  })

  it('reports "unavailable" when the directory cannot be reached, without leaking the error text', async () => {
    fetchStub().mockRejectedValue(new TypeError('secret internal detail'))
    const error = await findNearbyShops(22, 72, 5).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NearbySearchError)
    expect((error as NearbySearchError).code).toBe('unavailable')
    expect((error as Error).message).not.toContain('secret')
  })

  it('treats a directory "remark" as busy or unavailable instead of returning an empty list', async () => {
    fetchStub().mockResolvedValue(okResponse({ remark: 'runtime error: Query timed out', elements: [] }))
    await expect(findNearbyShops(23, 73, 5)).rejects.toMatchObject({ code: 'busy' })
  })
})

describe('repair session cache (sessionStorage)', () => {
  it('saves partial updates on top of what is stored, and clears', () => {
    expect(getSession()).toBeNull()
    saveSession({ description: 'one' })
    saveSession({ currentStep: 2 })
    expect(getSession()).toMatchObject({ description: 'one', currentStep: 2 })
    clearSession()
    expect(getSession()).toBeNull()
  })

  it('returns null for corrupted stored data', () => {
    sessionStorage.setItem('fixaura-session', '{not json')
    expect(getSession()).toBeNull()
  })

  it('setDiagnosis starts a fresh attempt with step 0 and no persistence info', () => {
    setDiagnosis(makeDiagnosis(), 'data:image/jpeg;base64,AAAA', 'It drips', 'user-1')
    const session = getSession()
    expect(session).toMatchObject({ ownerUserId: 'user-1', currentStep: 0, description: 'It drips' })
    expect(typeof session?.diagnosisAttemptId).toBe('string')
    expect(session?.diagnosisPersistence).toBeUndefined()
  })

  it('validates a diagnosis result strictly', () => {
    expect(isValidDiagnosisResult(makeDiagnosis())).toBe(true)
    expect(isValidDiagnosisResult(makeDiagnosis({ issueName: 'Unknown issue' }))).toBe(false)
    expect(isValidDiagnosisResult(makeDiagnosis({ confidence: 101 }))).toBe(false)
    expect(isValidDiagnosisResult(makeDiagnosis({ severity: 'extreme' as never }))).toBe(false)
    expect(isValidDiagnosisResult(null)).toBe(false)
  })

  it('a session only belongs to the user who made it', () => {
    setDiagnosis(makeDiagnosis(), 'data:image/jpeg;base64,AAAA', 'It drips', 'user-1')
    const session = getSession()
    expect(isValidDiagnosisSession(session, 'user-1')).toBe(true)
    expect(isValidDiagnosisSession(session, 'user-2')).toBe(false)
    expect(isValidDiagnosisSession(session, null)).toBe(false)
    expect(isValidDiagnosisSession(null, 'user-1')).toBe(false)
  })

  it('accepts a canonical uuid as a session id and nothing else', () => {
    expect(isValidSessionId('3f2b8a4e-1c5d-4e6f-8a9b-0c1d2e3f4a5b')).toBe(true)
    expect(isValidSessionId('abc')).toBe(false)
    expect(isValidSessionId('')).toBe(false)
    expect(isValidSessionId(undefined)).toBe(false)
  })
})

describe('capture helpers', () => {
  it('description must be 10 to 500 characters', () => {
    expect(validateDescription('short')).toBe('too_short')
    expect(validateDescription('   short    ')).toBe('too_short')
    expect(validateDescription('a'.repeat(10))).toBeNull()
    expect(validateDescription('a'.repeat(500))).toBeNull()
    expect(validateDescription('a'.repeat(501))).toBe('too_long')
  })

  it('photo must be a non-empty JPEG, PNG or WebP of at most 10 MB', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(validateImageFile({ type: 'IMAGE/PNG', size: 1000 })).toBeNull()
    expect(validateImageFile({ type: 'image/gif', size: 1000 })).toBe('type')
    expect(validateImageFile({ type: 'image/webp', size: 0 })).toBe('empty')
    expect(validateImageFile({ type: 'image/webp', size: 11 * 1024 * 1024 })).toBe('too_large')
  })

  it('scales a photo down to fit, and never up', () => {
    expect(fitWithin(4000, 2000, 1280)).toEqual({ width: 1280, height: 640 })
    expect(fitWithin(800, 600, 1280)).toEqual({ width: 800, height: 600 })
  })

  it('the description draft is kept per user and discarded for another user', () => {
    saveCaptureDraft('user-1', 'The tap drips')
    expect(loadCaptureDraft('user-1')).toBe('The tap drips')
    expect(loadCaptureDraft('user-2')).toBe('')
    expect(loadCaptureDraft('user-1')).toBe('')
    saveCaptureDraft('user-1', 'again')
    clearCaptureDraft()
    expect(loadCaptureDraft('user-1')).toBe('')
  })

  it('an empty draft is removed, not stored', () => {
    saveCaptureDraft('user-1', 'text')
    saveCaptureDraft('user-1', '   ')
    expect(loadCaptureDraft('user-1')).toBe('')
  })
})

describe('network and auth error helpers', () => {
  it('recognises connection failures by name or text, and an offline browser', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(Object.assign(new Error('x'), { name: 'AuthRetryableFetchError' }))).toBe(true)
    expect(isNetworkError(new Error('permission denied'))).toBe(false)
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    expect(isOffline()).toBe(true)
    expect(isNetworkError(new Error('anything'))).toBe(true)
  })

  it('maps sign-in errors to translated text and hides unknown backend messages', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'raw' })).toBe(t('auth.errorInvalidCredentials'))
    expect(authErrorMessage({ code: 'weak_password' })).toBe(t('auth.errorWeakPassword'))
    expect(authErrorMessage({ code: 'over_email_send_rate_limit' })).toBe(t('auth.errorRateLimit'))
    expect(authErrorMessage({ code: 'something_new', message: 'raw backend text' })).toBe(t('auth.errorGeneric'))
    expect(authErrorMessage(new Error('raw backend text'))).toBe(t('auth.errorGeneric'))
  })
})

describe('i18n helpers', () => {
  it('returns the key itself when a key is missing', () => {
    expect(t('no.such.key')).toBe('no.such.key')
  })

  it('switches language and remembers it, and sets the document language', () => {
    setLocale('hi')
    expect(getLocale()).toBe('hi')
    expect(localStorage.getItem('fixaura-locale')).toBe('hi')
    expect(document.documentElement.lang).toBe('hi')
    expect(t('common.brandName')).toBe('HomeGenie')
    setLocale('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('shows an error message only when it is already translated copy, otherwise the fallback', () => {
    expect(localizedErrorMessage(new Error(t('completion.saveError', 'en')), 'common.error')).toBe(t('completion.saveError'))
    expect(localizedErrorMessage(new Error('duplicate key value violates constraint'), 'common.error')).toBe(t('common.error'))
    expect(localizedErrorMessage('not an error', 'common.error')).toBe(t('common.error'))
  })
})

describe('analysis contract (response checking)', () => {
  const goodData = {
    issueName: 'Dripping tap',
    confidence: 82.4,
    summary: 'Worn washer.',
    severity: 'medium',
    recommendedFix: 'Replace washer.',
    recommendedTools: ['Wrench'],
    nextStepAdvice: 'Turn off water.',
    safetyWarning: 'Water off first.',
    explanation: 'Seal is worn.',
  }

  it('reads a good success envelope', () => {
    const result = diagnosisFromEnvelope({ ok: true, data: goodData })
    expect(result.confidence).toBe(82)
    expect(result.safetyStop).toBe(false)
  })

  it('treats high severity as a safety stop even if the server did not say so', () => {
    expect(diagnosisFromEnvelope({ ok: true, data: { ...goodData, severity: 'high' } }).safetyStop).toBe(true)
  })

  it('rejects a malformed or out-of-range success envelope instead of guessing', () => {
    for (const data of [
      { ...goodData, severity: 'extreme' },
      { ...goodData, confidence: 140 },
      { ...goodData, recommendedTools: 'wrench' },
      { ...goodData, issueName: '' },
    ]) {
      expect(() => diagnosisFromEnvelope({ ok: true, data })).toThrowError(AnalysisError)
    }
    expect(() => diagnosisFromEnvelope(null)).toThrowError(AnalysisError)
    expect(() => diagnosisFromEnvelope({ ok: true })).toThrowError(AnalysisError)
  })

  it('turns an error envelope into a typed error, even inside a 200 response', () => {
    const body = { ok: false, error: { code: 'rate_limited', retryable: true, retryAfterSeconds: 30 } }
    const error = errorFromEnvelope(body)
    expect(error).toBeInstanceOf(AnalysisError)
    expect(error).toMatchObject({ code: 'rate_limited', retryable: true, retryAfterSeconds: 30 })
    expect(() => diagnosisFromEnvelope(body)).toThrowError(AnalysisError)
    expect(errorFromEnvelope({ ok: false, error: { code: 'made_up', retryable: true } })).toBeNull()
    expect(errorFromEnvelope({ ok: false, error: { code: 'rate_limited', retryable: true, retryAfterSeconds: 99999 } })).toBeNull()
  })

  it('refuses an observation payload that over-claims', () => {
    expect(() => observationFromEnvelope({ ok: true, data: { status: 'visible_change' } })).toThrowError()
  })
})

describe('analyzeImage (edge function is a stub)', () => {
  const photo = () => new Blob(['pixels'], { type: 'image/jpeg' })

  it('rejects an empty or over-long description without calling the function', async () => {
    await expect(analyzeImage(photo(), '   ')).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(analyzeImage(photo(), 'x'.repeat(501))).rejects.toMatchObject({ code: 'invalid_input' })
    expect(functionsInvoke).not.toHaveBeenCalled()
  })

  it('sends only image, media type and description to analyze-image', async () => {
    functionsInvoke.mockResolvedValueOnce({
      data: {
        ok: true,
        data: {
          issueName: 'Dripping tap',
          confidence: 80,
          summary: 'Worn washer.',
          severity: 'low',
          recommendedFix: 'Replace washer.',
          recommendedTools: [],
          nextStepAdvice: '',
          safetyWarning: '',
          explanation: '',
        },
      },
      error: null,
    })
    const result = await analyzeImage(photo(), 'The tap drips')
    expect(result.issueName).toBe('Dripping tap')
    expect(functionsInvoke).toHaveBeenCalledTimes(1)
    const [name, options] = functionsInvoke.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }]
    expect(name).toBe('analyze-image')
    expect(Object.keys(options.body).sort()).toEqual(['description', 'imageBase64', 'mediaType'])
    expect(options.body.mediaType).toBe('image/jpeg')
  })

  it('maps HTTP failures from the function to typed errors', async () => {
    const cases: Array<[number, string, boolean]> = [
      [401, 'unauthenticated', false],
      [403, 'forbidden', false],
      [429, 'rate_limited', true],
      [400, 'invalid_input', false],
      [500, 'service_unavailable', true],
    ]
    for (const [status, code, retryable] of cases) {
      functionsInvoke.mockResolvedValueOnce({
        data: null,
        error: { context: new Response('not json', { status }) },
      })
      await expect(analyzeImage(photo(), 'The tap drips')).rejects.toMatchObject({ code, retryable })
    }
  })

  it('maps a thrown call to "service unavailable" and an empty reply to "invalid response"', async () => {
    functionsInvoke.mockRejectedValueOnce(new Error('network down'))
    await expect(analyzeImage(photo(), 'The tap drips')).rejects.toMatchObject({ code: 'service_unavailable' })
    functionsInvoke.mockResolvedValueOnce({ data: null, error: null })
    await expect(analyzeImage(photo(), 'The tap drips')).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('rejects an unsupported photo type before calling the function', async () => {
    await expect(analyzeImage(new Blob(['x'], { type: 'image/gif' }), 'The tap drips')).rejects.toThrow()
    expect(functionsInvoke).not.toHaveBeenCalled()
  })
})

describe('assistant (local demo replies, no backend)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stops with a safety reply when the message mentions an emergency hazard', async () => {
    const reply = await askAssistant({ message: 'I can smell gas near the stove', history: [], context: null, locale: 'en' })
    expect(reply).toEqual({ text: t('assistant.reply.hazard', 'en'), mock: true })
  })

  it('without an approved guide it does not explain steps or tools', async () => {
    const pending = askAssistant({ message: 'Explain this step again', history: [], context: null, locale: 'en' })
    await vi.advanceTimersByTimeAsync(1500)
    expect(await pending).toEqual({ text: t('assistant.reply.noApprovedGuide', 'en'), mock: true })
    vi.useRealTimers()
  })

  it('replies are always marked as demo replies and never call the network', async () => {
    const pending = askAssistant({ message: 'What can I repair?', history: [], context: null, locale: 'en' })
    await vi.advanceTimersByTimeAsync(1500)
    expect((await pending).mock).toBe(true)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(functionsInvoke).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

