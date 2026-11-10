import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import { setLocale, t } from '../src/i18n'
import { TEST_USER, resetSupabaseMock, setSignedInUser } from './helpers/supabaseMock'
import { renderAppAt } from './helpers/renderApp'
import { seedSession } from './helpers/fixtures'

vi.mock('../src/lib/supabase', async () => ({ supabase: (await import('./helpers/supabaseMock')).supabase }))
vi.mock('../src/lib/test-supabase', () => ({ testSupabaseConnection: vi.fn(async () => true) }))

// Landing integration cleanup: one navigation header, no raw translation keys, no
// fabricated hero claims, the tagline once, and the guide/danger gates unchanged.

const TAGLINE = 'Your home our intelligence'

/** Visible text only (no attribute values, no <script>/<style>). */
const pageText = () => document.body.textContent ?? ''

/** Something that looks like an i18n key: "group.key" or "group.sub.key" (any case). */
const RAW_KEY = /\b(?:nav|landing|common|guide|tools|diagnosis|history|blocked|auth|capture)\.[A-Za-z]+(?:\.[A-Za-z]+)*\b/i

async function renderLanding(locale: 'en' | 'hi') {
  setLocale(locale)
  renderAppAt('/')
  await screen.findByRole('heading', { level: 1 })
}

beforeEach(() => {
  resetSupabaseMock()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('landing: one navigation header', () => {
  it('renders exactly one header and the shared navigation on /', async () => {
    await renderLanding('en')
    expect(document.querySelectorAll('header')).toHaveLength(1)
    expect(screen.getAllByRole('navigation', { name: t('nav.mainMenu') }).length).toBeGreaterThanOrEqual(1)
    // The shared Navbar owns the language toggle and the scan action.
    expect(screen.getAllByRole('button', { name: t('common.toggleLanguageAria') })).toHaveLength(1)
  })

  it('navigation links point at sections that exist on the page', async () => {
    await renderLanding('en')
    for (const id of ['features', 'showcase', 'why-fixaura']) {
      expect(document.getElementById(id), `#${id}`).not.toBeNull()
    }
    // "Why HomeGenie" leads to the section that explains the product.
    const whySection = document.getElementById('why-fixaura')
    expect(whySection?.textContent).toContain(t('landing.whyTitle'))
  })
})

describe('landing: translated labels', () => {
  it.each(['en', 'hi'] as const)('shows no raw translation keys in %s', async (locale) => {
    await renderLanding(locale)
    expect(pageText()).not.toMatch(RAW_KEY)
    expect(pageText()).toContain(t('landing.demo.title', locale))
    expect(pageText()).toContain(t('nav.whyFixaura', locale))
  })

  it('updates the page when switching to Hindi', async () => {
    await renderLanding('en')
    act(() => setLocale('hi'))
    expect(await screen.findByText(t('landing.heroLine1', 'hi'))).toBeTruthy()
    expect(pageText()).not.toMatch(RAW_KEY)
  })
})

describe('landing: honest hero', () => {
  const banned = [
    /50k\+/i,
    /fear nothing/i,
    /कुछ भी न डरें/,
    /precision engineered/i,
    /सटीक रूप से इंजीनियर्ड/,
    /89\s*%/,
    /fixaura/i,
  ]

  it.each(['en', 'hi'] as const)('contains no fabricated or misleading claims in %s', async (locale) => {
    await renderLanding(locale)
    for (const pattern of banned) expect(pageText(), String(pattern)).not.toMatch(pattern)
    expect(document.querySelector('img[src*="randomuser"]')).toBeNull()
  })

  it('shows the exact brand tagline once in the brand area', async () => {
    await renderLanding('en')
    const header = document.querySelector('header')?.textContent ?? ''
    expect(header.split(TAGLINE).length - 1).toBe(1)
  })

  // The hero headline is the pre-architecture (a9c7376) wording from its own keys
  // (landing.heroLine1 / heroLine2), separate from the brand tagline in the header.
  it.each(['en', 'hi'] as const)('restores the a9c7376 hero headline in %s', async (locale) => {
    await renderLanding(locale)
    const h1 = screen.getByRole('heading', { level: 1 })
    const lines = [...h1.querySelectorAll('span')].map((span) => span.textContent)
    expect(lines).toEqual(['Your home', 'our intelligence'])
    expect(pageText()).not.toMatch(/Understand the problem|See the risk first|समस्या को समझें|पहले जोखिम देखें/)
  })

  it('has one hero visual: the a9c7376 preview mockup, labelled as an illustration', async () => {
    await renderLanding('en')
    expect(document.querySelectorAll('#preview')).toHaveLength(1)
    // The tap/faucet illustration is gone.
    expect(document.getElementById('interactive-demo')).toBeNull()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    const preview = document.getElementById('preview')
    expect(preview?.textContent).toContain(t('landing.demo.title'))
    expect(preview?.textContent).toContain(t('landing.preview.issueName'))
    const secondary = screen.getByRole('link', { name: t('landing.ctaSecondary') })
    expect(secondary.getAttribute('href')).toBe('#preview')
  })

  it.each(['en', 'hi'] as const)('landing copy makes no unavailable-feature claims in %s', async (locale) => {
    await renderLanding(locale)
    const text = pageText()
    for (const pattern of [
      /AR step overlays|AR स्टेप ओवरलेज़/i,
      /Visual AR cues|विज़ुअल AR/i,
      /generates a practical checklist|व्यावहारिक चेकलिस्ट बनाती/i,
      /Tool checklists|टूल चेकलिस्ट/i,
      /safety-first confirmations|सुरक्षा-पहले पुष्टि/i,
      /never take unsafe risks|never skip safety checks/i,
      /Step-by-Step AI Assistant|कदम-दर-कदम AI सहायक/i,
      /fix it yourself|खुद ठीक करने/i,
      /intelligent repair guidance|बुद्धिमान मरम्मत मार्गदर्शन/i,
    ]) {
      expect(text, String(pattern)).not.toMatch(pattern)
    }
    // The tagline and the a9c7376 hero are untouched.
    expect(document.querySelector('header')?.textContent).toContain(TAGLINE)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your homeour intelligence')
  })

  it.each(['en', 'hi'] as const)('the restored mockup omits the misleading claims in %s', async (locale) => {
    await renderLanding(locale)
    const preview = document.getElementById('preview')?.textContent ?? ''
    for (const key of [
      'landing.preview.confidenceText',
      'landing.preview.confidenceValue',
      'landing.preview.confidenceLabel',
      'landing.preview.safetyLine',
      'landing.preview.liveScanLabel',
      'landing.preview.arOverlayLockedLine',
    ]) {
      expect(preview, key).not.toContain(t(key, locale))
    }
    expect(pageText()).not.toMatch(/AR-guided steps|AR-मार्गदर्शित कदम/)
  })

  it('the hero headline does not force words to break mid-word', async () => {
    await renderLanding('en')
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.className).toContain('break-normal')
    expect(h1.className).not.toMatch(/max-w-\[\d+ch\]/)
  })
})

describe('landing cleanup keeps the guide and danger gates', () => {
  beforeEach(() => {
    setSignedInUser(TEST_USER)
  })

  it('/guide still shows "not available" for a safe-looking result', async () => {
    seedSession({ severity: 'low' })
    renderAppAt('/guide')
    expect(await screen.findByRole('heading', { name: t('guide.unavailableTitle') })).toBeTruthy()
  })

  it('/tools still shows the blocked panel for a high-risk result', async () => {
    seedSession({ severity: 'high' })
    renderAppAt('/tools')
    expect(await screen.findByRole('heading', { name: t('blocked.titleProfessional') })).toBeTruthy()
  })
})
