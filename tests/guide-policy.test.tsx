import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { t } from '../src/i18n'
import { TEST_USER, functionsInvoke, resetSupabaseMock, setSignedInUser } from './helpers/supabaseMock'
import { renderAppAt } from './helpers/renderApp'
import { makeDiagnosis, seedSession } from './helpers/fixtures'
import { getGuideAvailability, isGuideAvailable } from '../src/utils/guideAvailability'
import { getSession } from '../src/services/repairSession'
import { seedRepairCache, type ResumeView } from '../src/services/sessionResume'
import type { RepairStep } from '../src/types/repair'

vi.mock('../src/lib/supabase', async () => ({ supabase: (await import('./helpers/supabaseMock')).supabase }))
vi.mock('../src/lib/test-supabase', () => ({ testSupabaseConnection: vi.fn(async () => true) }))

// V05 approved-template policy after the integration recovery: AI-generated steps,
// steps built from the diagnosis, cached steps and a low/medium risk level must NOT
// unlock a guide. Only a reviewed approved template does, and none exists for live data.

const STEPS: RepairStep[] = [1, 2, 3, 4].map((n) => ({
  id: `step-${n}`,
  title: `Generated step ${n}`,
  instruction: `Do generated thing number ${n} carefully.`,
  safetyNote: '',
  requiresConfirmation: false,
  visualCue: 'circle',
  estimatedSeconds: 60,
}))

describe('guide gate: nothing but an approved template unlocks it', () => {
  it('valid AI-generated steps on a low-risk result do not unlock the guide', () => {
    const diagnosis = makeDiagnosis({ severity: 'low', guideSteps: STEPS })
    expect(getGuideAvailability(null, { diagnosis, decision: 'safe' }).status).toBe('unavailable')
    expect(isGuideAvailable(null, { diagnosis, decision: 'caution' })).toBe(false)
  })

  it('a low or medium risk level with a recommended fix does not unlock the guide', () => {
    for (const severity of ['low', 'medium'] as const) {
      expect(isGuideAvailable(null, { diagnosis: makeDiagnosis({ severity }) })).toBe(false)
    }
  })

  it('a blocked result is reported as risk-blocked even if a fixture template is present', () => {
    const extras = {
      sessionId: 's',
      observations: [],
      possibleCauses: [],
      evidenceStrength: 'low' as const,
      limitations: [],
      riskLevel: 'low' as const,
      safetyReasons: [],
      nextAction: 'continue_diy' as const,
      followUpQuestions: [],
      approvedTemplateId: 'fixture-template-tap',
      policyVersion: 'fixture',
    }
    expect(
      getGuideAvailability(extras, { allowFixtureTemplates: true, decision: 'emergency' })
    ).toEqual({ status: 'unavailable', reason: 'risk_blocked' })
    expect(
      getGuideAvailability(extras, { allowFixtureTemplates: true, diagnosis: makeDiagnosis({ severity: 'high' }) })
    ).toEqual({ status: 'unavailable', reason: 'risk_blocked' })
  })
})

describe('saved or generated steps never feed the guide', () => {
  beforeEach(() => {
    resetSupabaseMock()
    setSignedInUser(TEST_USER)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('/guide stays unavailable when the cache already holds generated steps', async () => {
    seedSession({ severity: 'low', guideSteps: STEPS }, { steps: STEPS, currentStep: 1 })
    renderAppAt('/guide')
    expect(await screen.findByRole('heading', { name: t('guide.unavailableTitle') })).toBeTruthy()
    for (const step of STEPS) expect(screen.queryByText(step.title)).toBeNull()
    expect(screen.queryByText(t('guide.aiGeneratedNotice'))).toBeNull()
    expect(screen.queryByText(t('guide.fallbackNotice'))).toBeNull()
  })

  it('/tools shows no fallback checklist items for a medium-risk result', async () => {
    seedSession({ severity: 'medium', recommendedTools: ['Screwdriver'] })
    renderAppAt('/tools')
    expect(await screen.findByRole('heading', { name: t('guide.unavailableTitle') })).toBeTruthy()
    expect(screen.queryByText('Screwdriver')).toBeNull()
    expect(screen.queryByText(t('tools.protectiveGloves'))).toBeNull()
    expect(screen.queryByText(t('guide.safetyStepTitle'))).toBeNull()
    expect(functionsInvoke).not.toHaveBeenCalled()
  })

  it('the diagnosis page does not save generated steps to the cache', async () => {
    seedSession({ severity: 'low', guideSteps: STEPS })
    renderAppAt('/diagnosis')
    await screen.findByRole('heading', { name: t('diagnosis.title') })
    expect(screen.queryByText(t('diagnosis.ctaTools'))).toBeNull()
    expect(getSession()?.steps ?? []).toEqual([])
  })
})

describe('seedRepairCache keeps the durable session and photo, but no steps', () => {
  it('writes ownership, ids and the photo path, and never generated steps', () => {
    const view: ResumeView = {
      id: '3f2b8a4e-1c5d-4e6f-8a9b-0c1d2e3f4a5b',
      status: 'in_progress',
      issueName: 'Dripping tap',
      description: 'The tap drips.',
      diagnosis: makeDiagnosis({ severity: 'low', guideSteps: STEPS }),
      currentStep: 3,
      updatedAt: null,
      hasStoredPhoto: true,
      imagePath: 'user-1/session/photo.jpg',
    }
    expect(seedRepairCache(view, TEST_USER.id)).toBe(true)
    const cached = getSession()
    expect(cached).toMatchObject({
      ownerUserId: TEST_USER.id,
      historySessionId: view.id,
      diagnosisPersistence: { userId: TEST_USER.id, repairSessionId: view.id },
      imagePath: view.imagePath,
      steps: [],
      currentStep: 0,
    })
  })

  it('refuses a row without a diagnosis', () => {
    expect(
      seedRepairCache(
        { id: 'x', status: 'in_progress', issueName: null, description: '', diagnosis: null, currentStep: 0, updatedAt: null, hasStoredPhoto: false },
        TEST_USER.id
      )
    ).toBe(false)
  })
})
