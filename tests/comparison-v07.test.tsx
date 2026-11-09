import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { t } from '../src/i18n'
import { functionsInvoke, resetSupabaseMock, storageCalls } from './helpers/supabaseMock'
import { seedSession } from './helpers/fixtures'
import Verify from '../src/Pages/Verify'
import Completion from '../src/Pages/Completion'
import {
  canStartComparison,
  comparisonReducer,
  inputState,
  observationForStatus,
  observationLabelKey,
  type ComparisonState,
} from '../src/utils/comparisonState'
import { saveSession } from '../src/services/repairSession'

vi.mock('../src/lib/supabase', async () => ({ supabase: (await import('./helpers/supabaseMock')).supabase }))

// The camera widget is replaced by a button that "takes" an after photo. No media is used.
vi.mock('../src/components/PhotoCapture', () => ({
  default: ({ onChange }: { onChange: (photo: { blob: Blob; dataUrl: string } | null) => void }) => (
    <button
      type="button"
      onClick={() => onChange({ blob: new Blob(['x'], { type: 'image/jpeg' }), dataUrl: 'data:image/jpeg;base64,BBBB' })}
    >
      add-after-photo
    </button>
  ),
}))

// V07: the comparison screen is honest. No comparison service exists, so nothing is sent,
// nothing is saved, and the screen never says or implies that a repair worked.

const SUCCESS_WORDS = /\b(fixed|repaired|resolved|successful(ly)?|success|certified|guaranteed?|safe to use|all clear)\b/i

/**
 * Page text with the two disclaimers removed. Those sentences contain a success word only
 * to deny it ("cannot confirm that a repair was successful"); nothing else may use one.
 */
function claimsText(container: HTMLElement) {
  return (container.textContent ?? '')
    .replace(t('verify.limitation'), '')
    .replace(t('completion.notSafetyCheck'), '')
}

function renderVerify() {
  return render(
    <MemoryRouter initialEntries={['/verify']}>
      <Verify />
    </MemoryRouter>
  )
}

beforeEach(() => {
  resetSupabaseMock()
})

describe('Verify screen (before/after comparison)', () => {
  beforeEach(() => {
    seedSession()
  })

  it('cannot compare until an after photo exists', () => {
    renderVerify()
    const compare = screen.getByRole('button', { name: t('verify.submit') }) as HTMLButtonElement
    expect(compare.disabled).toBe(true)
    expect(screen.getByText(t('verify.afterRequired'))).toBeTruthy()
  })

  it('comparing sends nothing and says the comparison is not available', async () => {
    renderVerify()
    fireEvent.click(screen.getByText('add-after-photo'))
    const compare = screen.getByRole('button', { name: t('verify.submit') }) as HTMLButtonElement
    expect(compare.disabled).toBe(false)

    fireEvent.click(compare)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(t('verify.errorPanel.unavailable'))
    expect(functionsInvoke).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(storageCalls).toEqual([])
  })

  it('shows no observation or result after pressing compare', async () => {
    renderVerify()
    fireEvent.click(screen.getByText('add-after-photo'))
    fireEvent.click(screen.getByRole('button', { name: t('verify.submit') }))
    await screen.findByRole('alert')
    expect(screen.queryByText(t('verify.observation.title'))).toBeNull()
    for (const label of ['issue_not_visible', 'keep_watching', 'issue_still_visible', 'needs_professional']) {
      expect(screen.queryByText(t(observationLabelKey(label as never)))).toBeNull()
    }
    expect(screen.queryByText(t('verify.inconclusive.title'))).toBeNull()
  })

  it('when offline it reports offline (not an observation) and offers a retry', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    renderVerify()
    fireEvent.click(screen.getByText('add-after-photo'))
    fireEvent.click(screen.getByRole('button', { name: t('verify.submit') }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(t('verify.errorPanel.offline'))
    expect(screen.getByRole('button', { name: t('common.retry') })).toBeTruthy()
    expect(functionsInvoke).not.toHaveBeenCalled()
  })

  it('never uses success wording on the screen', async () => {
    const { container } = renderVerify()
    fireEvent.click(screen.getByText('add-after-photo'))
    fireEvent.click(screen.getByRole('button', { name: t('verify.submit') }))
    await screen.findByRole('alert')
    expect(claimsText(container)).not.toMatch(SUCCESS_WORDS)
  })

  it('keeps "finish the steps" separate from the comparison', () => {
    renderVerify()
    expect(screen.getByRole('button', { name: t('verify.finish') })).toBeTruthy()
    expect(screen.getByText(t('verify.finishHint'))).toBeTruthy()
    expect(screen.getByText(t('verify.limitation'))).toBeTruthy()
  })
})

describe('Completion screen', () => {
  it('without a finished repair it says there are no finished steps', () => {
    seedSession()
    render(
      <MemoryRouter>
        <Completion />
      </MemoryRouter>
    )
    expect(screen.getByText(t('completion.notCompleted'))).toBeTruthy()
  })

  it('with a finished repair it says steps were finished, not that the repair worked', () => {
    seedSession()
    saveSession({
      completedRepair: {
        id: 'c1',
        diagnosisId: 'guest-repair',
        repairSummary: 'Replace the washer.',
        completedAt: '2026-11-06T10:00:00.000Z',
        feedbackRating: null,
      },
      completedAt: '2026-11-06T10:00:00.000Z',
    })
    const { container } = render(
      <MemoryRouter>
        <Completion />
      </MemoryRouter>
    )
    expect(screen.getByText(t('completion.notSafetyCheck'))).toBeTruthy()
    expect(screen.getByText(t('completion.noComparison'))).toBeTruthy()
    expect(screen.getByText(t('completion.notSaved'))).toBeTruthy()
    expect(screen.getByText(t('completion.savingsUnavailable'))).toBeTruthy()
    expect(claimsText(container)).not.toMatch(SUCCESS_WORDS)
  })
})

describe('comparison state rules', () => {
  const ready: ComparisonState = { kind: 'ready' }

  it('needs the before photo first, then the after photo', () => {
    expect(inputState(false, false)).toEqual({ kind: 'needs_before' })
    expect(inputState(false, true)).toEqual({ kind: 'needs_before' })
    expect(inputState(true, false)).toEqual({ kind: 'needs_after' })
    expect(canStartComparison(inputState(true, true))).toBe(true)
    expect(canStartComparison(inputState(true, false))).toBe(false)
  })

  it('cannot start without both photos, and cannot jump to a result without comparing', () => {
    expect(comparisonReducer({ kind: 'needs_after' }, { type: 'start' })).toEqual({ kind: 'needs_after' })
    expect(comparisonReducer(ready, { type: 'observed', status: 'resolved' })).toEqual(ready)
    expect(comparisonReducer(ready, { type: 'inconclusive' })).toEqual(ready)
  })

  it('an unrecognised server status is an unusable response, never an observation', () => {
    const comparing = comparisonReducer(ready, { type: 'start' })
    expect(comparisonReducer(comparing, { type: 'observed', status: 'fixed' })).toEqual({
      kind: 'error',
      error: 'invalid_response',
    })
  })

  it('server statuses map to neutral labels that describe the photo, not the repair', () => {
    expect(observationForStatus('resolved')).toBe('issue_not_visible')
    expect(observationForStatus('monitor')).toBe('keep_watching')
    expect(observationForStatus('unresolved')).toBe('issue_still_visible')
    expect(observationForStatus('professional')).toBe('needs_professional')
    expect(observationForStatus('success')).toBeNull()
    expect(observationForStatus(undefined)).toBeNull()
  })

  it('no English observation label uses success wording', () => {
    const en = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src', 'i18n', 'en.json'), 'utf8')
    ) as { verify: { observation: Record<string, string> } }
    for (const [key, text] of Object.entries(en.verify.observation)) {
      if (key === 'title') continue
      expect(text, key).not.toMatch(SUCCESS_WORDS)
    }
  })
})

