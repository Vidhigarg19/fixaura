import { describe, expect, it, vi } from 'vitest'
import { capText, stripPhotoData, toResumeView } from '../src/services/sessionResume'
import { textRiskSignal } from '../src/utils/combinedRisk'
import {
  MAX_CHECK_LABEL_LENGTH,
  MAX_DIAGNOSIS_TEXT_LENGTH,
  MAX_ISSUE_NAME_LENGTH,
  MAX_TOOL_LENGTH,
  MAX_TOOLS,
} from '../src/config/limits'
import type { HistorySession } from '../src/services/historyService'
import { makeDiagnosis } from './helpers/fixtures'

vi.mock('../src/lib/supabase', async () => ({ supabase: (await import('./helpers/persistenceFake')).supabase }))

// D13: stored diagnosis text is capped, visibly, without ever lowering the hazard screen.

const len = (text: string) => Array.from(text).length
const long = (n: number, word = 'word ') => word.repeat(Math.ceil(n / word.length)).slice(0, n)

describe('capText', () => {
  it('returns short text unchanged and cuts long text to exactly the limit with "…"', () => {
    expect(capText('short', 10)).toBe('short')
    expect(capText('x'.repeat(10), 10)).toBe('x'.repeat(10))
    const cut = capText('x'.repeat(11), 10)
    expect(cut).toBe(`${'x'.repeat(9)}…`)
    expect(len(cut)).toBe(10)
  })

  it('counts code points, so a cut never splits an emoji or a Devanagari character pair', () => {
    const cut = capText('😀'.repeat(20), 5)
    expect(cut).toBe(`${'😀'.repeat(4)}…`)
    expect(cut).not.toContain('\uFFFD')
  })
})

describe('stored diagnosis caps (stripPhotoData)', () => {
  it('leaves an ordinary result exactly as it was', () => {
    expect(stripPhotoData(makeDiagnosis())).toEqual(makeDiagnosis())
  })

  it('caps prose fields, the issue name and the tool list, each with a visible "…"', () => {
    const stored = stripPhotoData(
      makeDiagnosis({
        issueName: long(200, 'Leaking pipe '),
        summary: long(3000),
        recommendedFix: long(3000),
        explanation: long(3000),
        nextStepAdvice: long(3000),
        recommendedTools: Array.from({ length: 30 }, (_, i) => `Tool ${i} ${long(200)}`),
      })
    )
    expect(len(stored.issueName)).toBe(MAX_ISSUE_NAME_LENGTH)
    for (const text of [stored.summary, stored.recommendedFix, stored.explanation ?? '', stored.nextStepAdvice]) {
      expect(len(text)).toBe(MAX_DIAGNOSIS_TEXT_LENGTH)
      expect(text.endsWith('…')).toBe(true)
    }
    expect(stored.recommendedTools).toHaveLength(MAX_TOOLS)
    for (const tool of stored.recommendedTools) expect(len(tool)).toBe(MAX_TOOL_LENGTH)
  })

  it('never shortens the safety warning', () => {
    const warning = `Turn off the water and the power first. ${long(3000)}`
    expect(stripPhotoData(makeDiagnosis({ safetyWarning: warning })).safetyWarning).toBe(warning)
  })

  it('keeps screened text whole when cutting it would hide a hazard (no lower risk after reload)', () => {
    const summary = `${long(1500)} Also I smell gas near the boiler.`
    const full = makeDiagnosis({ summary })
    expect(textRiskSignal(full)).not.toBe('safe')

    const stored = stripPhotoData(full)
    expect(stored.summary).toBe(summary)
    expect(textRiskSignal(stored)).toBe(textRiskSignal(full))
    // Fields the screen does not read are still capped.
    const withAdvice = stripPhotoData(makeDiagnosis({ summary, nextStepAdvice: long(3000) }))
    expect(len(withAdvice.nextStepAdvice)).toBe(MAX_DIAGNOSIS_TEXT_LENGTH)
  })

  it('cuts screened text when the hazard is still visible after the cut', () => {
    const summary = `I smell gas near the boiler. ${long(3000)}`
    const stored = stripPhotoData(makeDiagnosis({ summary }))
    expect(len(stored.summary)).toBe(MAX_DIAGNOSIS_TEXT_LENGTH)
    expect(textRiskSignal(stored)).toBe(textRiskSignal(makeDiagnosis({ summary })))
  })

  it('caps verification text and check labels', () => {
    const stored = stripPhotoData(
      makeDiagnosis({
        verification: {
          status: 'monitor',
          summary: long(3000),
          nextAdvice: long(3000),
          checks: [{ label: long(500), passed: true }],
        },
      })
    )
    expect(len(stored.verification?.summary ?? '')).toBe(MAX_DIAGNOSIS_TEXT_LENGTH)
    expect(len(stored.verification?.nextAdvice ?? '')).toBe(MAX_DIAGNOSIS_TEXT_LENGTH)
    expect(len(stored.verification?.checks[0].label ?? '')).toBe(MAX_CHECK_LABEL_LENGTH)
  })

  it('an older oversized row is capped when it is shown again (resume view)', () => {
    const row = {
      id: '3f2b8a4e-1c5d-4e6f-8a9b-0c1d2e3f4a5b',
      user_id: 'user-1',
      title: 'Dripping tap',
      description: 'd',
      issue_name: 'Dripping tap',
      diagnosis: makeDiagnosis({ summary: long(5000) }),
      steps: [],
      current_step: 0,
      status: 'in_progress',
      image_path: null,
      created_at: null,
      updated_at: null,
      completed_at: null,
      message_count: 0,
    } satisfies HistorySession
    expect(len(toResumeView(row).diagnosis?.summary ?? '')).toBe(MAX_DIAGNOSIS_TEXT_LENGTH)
  })
})
