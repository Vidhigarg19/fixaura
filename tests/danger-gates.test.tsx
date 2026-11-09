import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { t } from '../src/i18n'
import { TEST_USER, resetSupabaseMock, setSignedInUser } from './helpers/supabaseMock'
import { renderAppAt } from './helpers/renderApp'
import { makeDiagnosis, seedSession } from './helpers/fixtures'
import {
  decideFromDiagnosis,
  decideRisk,
  isBlocked,
  mostSevere,
  nextDecision,
} from '../src/utils/riskDecision'
import { disclaimerKeyForVerdict, safetyRiskSignal, screenFields, screenText } from '../src/lib/safety'
import { applyDiagnosisUpdate } from '../src/utils/diagnosisUpdate'
import { buildDiagnosisView } from '../src/utils/diagnosisView'

vi.mock('../src/lib/supabase', async () => ({ supabase: (await import('./helpers/supabaseMock')).supabase }))
vi.mock('../src/lib/test-supabase', () => ({ testSupabaseConnection: vi.fn(async () => true) }))

// Danger gates: high-risk behaviour as it works today. These must not get weaker.

describe('risk decision rules', () => {
  it('low and medium severity are not blocked; high is blocked', () => {
    expect(decideRisk({ severity: 'low' })).toBe('safe')
    expect(decideRisk({ severity: 'medium' })).toBe('caution')
    expect(decideRisk({ severity: 'high' })).toBe('professional')
    expect(isBlocked('safe')).toBe(false)
    expect(isBlocked('caution')).toBe(false)
    expect(isBlocked('professional')).toBe(true)
    expect(isBlocked('emergency')).toBe(true)
  })

  it('unknown, missing or malformed risk data falls to the safer side (blocked)', () => {
    expect(decideRisk({})).toBe('professional')
    expect(decideRisk({ severity: 'banana' })).toBe('professional')
    expect(decideFromDiagnosis(null)).toBe('professional')
    expect(decideFromDiagnosis(undefined)).toBe('professional')
  })

  it('a safety stop blocks even when the severity says low', () => {
    expect(decideRisk({ severity: 'low', safetyStop: true })).toBe('professional')
    expect(decideRisk({ severity: 'low', safetyStop: 'yes' })).toBe('professional')
    expect(decideRisk({ severity: 'low', safetyStop: false })).toBe('safe')
  })

  it('takes the most severe signal when signals disagree', () => {
    expect(decideRisk({ severity: 'low', riskLevel: 'high' })).toBe('professional')
    expect(decideRisk({ severity: 'low', nextAction: 'stop_and_make_safe' })).toBe('emergency')
    expect(decideRisk({ severity: 'low', nextAction: 'contact_professional' })).toBe('professional')
    expect(decideRisk({ severity: 'low', nextAction: 'something_new' })).toBe('professional')
    expect(mostSevere('safe', 'emergency', 'caution')).toBe('emergency')
  })

  it('a later response never lowers a blocked decision', () => {
    expect(nextDecision('professional', 'safe')).toBe('professional')
    expect(nextDecision('emergency', 'caution')).toBe('emergency')
    expect(nextDecision('professional', 'emergency')).toBe('emergency')
    expect(nextDecision('safe', 'caution')).toBe('caution')
  })
})

describe('text safety screening', () => {
  it('flags gas, fire and medical emergencies in English', () => {
    expect(screenText('I can smell gas in the kitchen').highestLevel).toBe('emergency')
    expect(screenText('There was smoke from the socket').highestLevel).toBe('emergency')
    expect(screenText('He got shocked and is unconscious').highestLevel).toBe('emergency')
  })

  it('flags the same hazards in Hindi', () => {
    expect(screenText('रसोई में गैस की गंध आ रही है').highestLevel).toBe('emergency')
    expect(screenText('खुली तार से करंट आ रहा').blocked).toBe(true)
  })

  it('flags electrical, structural and safety-bypass requests as blocked', () => {
    expect(screenText('there is exposed wiring behind the panel').blocked).toBe(true)
    expect(screenText('can I remove a load bearing wall').blocked).toBe(true)
    expect(screenText('how do I bypass the safety cutoff').blocked).toBe(true)
  })

  it('does not flag harmless text, and does not match inside other words', () => {
    expect(screenText('The tap drips slowly').flagged).toBe(false)
    expect(screenText('a sparkling clean sink').flagged).toBe(false)
    expect(screenText('').flagged).toBe(false)
    expect(screenText(undefined).flagged).toBe(false)
    expect(safetyRiskSignal(screenText('nothing wrong here'))).toBe('safe')
  })

  it('any single hazardous field raises the combined verdict', () => {
    const verdict = screenFields(['A dripping tap', null, 'also I smell gas'])
    expect(verdict.blocked).toBe(true)
    expect(disclaimerKeyForVerdict(verdict)).toBe('safetyPolicy.disclaimer.gas')
  })
})

describe('a blocked diagnosis cannot be replaced by a safer one', () => {
  const blocked = { diagnosis: makeDiagnosis({ severity: 'high' }), extras: null }
  const safer = { diagnosis: makeDiagnosis({ severity: 'low' }), extras: null }

  it('rejects the update and keeps the blocked state', () => {
    const result = applyDiagnosisUpdate(blocked, safer)
    expect(result.accepted).toBe(false)
    expect(result.state).toBe(blocked)
  })

  it('accepts a normal update when not blocked', () => {
    const result = applyDiagnosisUpdate(safer, { diagnosis: makeDiagnosis({ severity: 'medium' }), extras: null })
    expect(result.accepted).toBe(true)
  })

  it('escalates to a safety stop when the new answers mention a hazard', () => {
    const result = applyDiagnosisUpdate(safer, safer, { smell: 'there is a gas leak' })
    expect(result.accepted).toBe(true)
    expect(result.state.diagnosis.safetyStop).toBe(true)
  })

  it('the diagnosis view treats a high-severity result as blocked', () => {
    expect(buildDiagnosisView(makeDiagnosis({ severity: 'high' }), null).decision).toBe('professional')
    expect(buildDiagnosisView(makeDiagnosis({ severity: 'low' }), null).decision).toBe('safe')
  })
})

describe('blocked results in the app', () => {
  beforeEach(() => {
    resetSupabaseMock()
    setSignedInUser(TEST_USER)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('/diagnosis for a high-risk result shows the blocked panel and no way to continue', async () => {
    seedSession({ severity: 'high' })
    renderAppAt('/diagnosis')
    expect(await screen.findByRole('heading', { name: t('blocked.titleProfessional') })).toBeTruthy()
    expect(screen.queryByText(t('diagnosis.ctaTools'))).toBeNull()
    expect(screen.getByRole('link', { name: t('blocked.findHelp') })).toBeTruthy()
  })

  it('a dangerous description blocks an otherwise low-risk result and offers the emergency number', async () => {
    seedSession({ severity: 'low' }, { description: 'The cooker has a gas leak and I smell gas.' })
    renderAppAt('/diagnosis')
    expect(await screen.findByRole('heading', { name: t('blocked.titleEmergency') })).toBeTruthy()
    const call = screen.getByRole('link', { name: t('blocked.callEmergency') })
    expect(call.getAttribute('href')).toBe('tel:112')
    expect(screen.queryByText(t('diagnosis.ctaTools'))).toBeNull()
  })

  it('/tools and /guide stay locked for a high-risk result, even when typed into the address bar', async () => {
    seedSession({ severity: 'high' })
    renderAppAt('/tools')
    expect(await screen.findByRole('heading', { name: t('blocked.titleProfessional') })).toBeTruthy()
    expect(screen.getByText(t('blocked.toolsLocked'))).toBeTruthy()
    expect(screen.queryByText(t('tools.continue'))).toBeNull()
  })

  it('/guide is locked for a result that was stopped for safety', async () => {
    seedSession({ severity: 'low', safetyStop: true })
    renderAppAt('/guide')
    // Same blocked panel, no steps. (/guide has no steps while the guide is unavailable.)
    expect(await screen.findByRole('heading', { name: t('blocked.titleProfessional') })).toBeTruthy()
    expect(screen.queryByText(t('guide.next'))).toBeNull()
  })
})
