import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { t } from '../src/i18n'
import { TEST_USER, functionsInvoke, resetSupabaseMock, setSignedInUser } from './helpers/supabaseMock'
import { renderAppAt } from './helpers/renderApp'
import { seedSession } from './helpers/fixtures'
import {
  GUIDE_TEMPLATE_POLICY_VERSION,
  getGuideAvailability,
  guideUnavailableReasonKey,
  isGuideAvailable,
} from '../src/utils/guideAvailability'
import type { AgreedDiagnosis } from '../src/utils/diagnosisView'

vi.mock('../src/lib/supabase', async () => ({ supabase: (await import('./helpers/supabaseMock')).supabase }))
vi.mock('../src/lib/test-supabase', () => ({ testSupabaseConnection: vi.fn(async () => true) }))

// V05: guided repair (/tools and /guide) stays closed until an approved template exists.
// Today no approved template ids are registered, so live results never unlock it.

function agreed(overrides: Partial<AgreedDiagnosis> = {}): AgreedDiagnosis {
  return {
    sessionId: 'session-1',
    observations: ['Water drips from the spout.'],
    possibleCauses: ['Worn washer'],
    evidenceStrength: 'medium',
    limitations: [],
    riskLevel: 'low',
    safetyReasons: [],
    nextAction: 'continue_diy',
    followUpQuestions: [],
    approvedTemplateId: 'some-template',
    policyVersion: GUIDE_TEMPLATE_POLICY_VERSION,
    ...overrides,
  }
}

describe('guide availability gate (fail closed)', () => {
  it('is unavailable when there is no agreed backend data', () => {
    expect(getGuideAvailability(null)).toEqual({ status: 'unavailable', reason: 'no_approved_content' })
    expect(getGuideAvailability(undefined)).toEqual({ status: 'unavailable', reason: 'no_approved_content' })
    expect(isGuideAvailable()).toBe(false)
  })

  it('is unavailable when the diagnosis names no approved template', () => {
    expect(getGuideAvailability(agreed({ approvedTemplateId: null }))).toEqual({
      status: 'unavailable',
      reason: 'no_template',
    })
  })

  it('is unavailable for a template id that is not in the approved registry', () => {
    expect(getGuideAvailability(agreed({ approvedTemplateId: 'made-up-by-the-model' }))).toEqual({
      status: 'unavailable',
      reason: 'unknown_template',
    })
  })

  it('only accepts the fixture template when fixture mode is explicitly allowed', () => {
    const fixture = agreed({ approvedTemplateId: 'fixture-template-tap' })
    expect(isGuideAvailable(fixture)).toBe(false)
    expect(isGuideAvailable(fixture, { allowFixtureTemplates: true })).toBe(true)
  })

  it('maps each unavailable reason to a translated explanation', () => {
    expect(guideUnavailableReasonKey('no_approved_content')).toBe('guide.unavailableBody')
    expect(guideUnavailableReasonKey('no_template')).toBe('guide.unavailableUnsupported')
    expect(guideUnavailableReasonKey('unknown_template')).toBe('guide.unavailableUnsupported')
    expect(guideUnavailableReasonKey('policy_version_mismatch')).toBe('guide.unavailableStale')
  })
})

describe('/tools and /guide with a safe-looking diagnosis', () => {
  beforeEach(() => {
    resetSupabaseMock()
    setSignedInUser(TEST_USER)
    seedSession({ severity: 'low', recommendedTools: ['Adjustable wrench', 'Gloves'] })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('/tools shows the "not available" panel and no checklist', async () => {
    renderAppAt('/tools')
    expect(await screen.findByRole('heading', { name: t('guide.unavailableTitle') })).toBeTruthy()
    // The model's free-text tools are never shown as an approved checklist.
    expect(screen.queryByText('Adjustable wrench')).toBeNull()
    expect(screen.queryByText(t('tools.haveAll'))).toBeNull()
    expect(screen.queryByText(t('tools.continue'))).toBeNull()
    expect(window.location.pathname).toBe('/tools')
  })

  it('/guide shows the "not available" panel and no repair steps', async () => {
    renderAppAt('/guide')
    expect(await screen.findByRole('heading', { name: t('guide.unavailableTitle') })).toBeTruthy()
    expect(screen.queryByText(t('guide.next'))).toBeNull()
    expect(screen.queryByText(t('guide.confirmStep'))).toBeNull()
    expect(screen.queryByText(t('guide.safetyConfirm'))).toBeNull()
    expect(window.location.pathname).toBe('/guide')
  })

  it('the panel only offers navigation: back to result, dashboard, find help', async () => {
    renderAppAt('/tools')
    await screen.findByRole('heading', { name: t('guide.unavailableTitle') })
    expect(screen.getByRole('link', { name: t('guide.backToResult') })).toBeTruthy()
    expect(screen.getByRole('link', { name: t('nav.dashboard') })).toBeTruthy()
    expect(screen.getByRole('link', { name: t('blocked.findHelp') })).toBeTruthy()
  })

  it('the diagnosis page does not offer "See tools needed" either', async () => {
    renderAppAt('/diagnosis')
    await screen.findByRole('heading', { name: t('diagnosis.title') })
    expect(screen.queryByText(t('diagnosis.ctaTools'))).toBeNull()
  })

  it('opening these pages sends no request to a backend function or the network', async () => {
    renderAppAt('/guide')
    await screen.findByRole('heading', { name: t('guide.unavailableTitle') })
    expect(functionsInvoke).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
