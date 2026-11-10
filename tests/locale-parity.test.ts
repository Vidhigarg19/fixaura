import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Characterization of the current locale files: same keys, no duplicate keys, 616 each.

const read = (name: string) => readFileSync(resolve(process.cwd(), 'src', 'i18n', `${name}.json`), 'utf8')

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

function leaves(value: Json, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[prefix, value]]
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, prefix ? `${prefix}.${key}` : key)
    )
  }
  throw new Error(`Unexpected non-string leaf at ${prefix}`)
}

/** Finds repeated keys inside one JSON object. JSON.parse silently keeps the last one. */
function findDuplicateKeys(source: string): string[] {
  const duplicates: string[] = []
  let index = 0

  const skipSpace = () => {
    while (index < source.length && /\s/.test(source[index])) index += 1
  }
  const readString = (): string => {
    const start = index
    index += 1
    while (source[index] !== '"') index += source[index] === '\\' ? 2 : 1
    index += 1
    return JSON.parse(source.slice(start, index)) as string
  }
  const readValue = (path: string) => {
    skipSpace()
    const char = source[index]
    if (char === '{') {
      index += 1
      const seen = new Set<string>()
      skipSpace()
      if (source[index] === '}') {
        index += 1
        return
      }
      for (;;) {
        skipSpace()
        const key = readString()
        const full = path ? `${path}.${key}` : key
        if (seen.has(key)) duplicates.push(full)
        seen.add(key)
        skipSpace()
        index += 1 // ':'
        readValue(full)
        skipSpace()
        if (source[index] === ',') {
          index += 1
          continue
        }
        index += 1 // '}'
        return
      }
    }
    if (char === '[') {
      index += 1
      skipSpace()
      if (source[index] === ']') {
        index += 1
        return
      }
      for (;;) {
        readValue(path)
        skipSpace()
        if (source[index] === ',') {
          index += 1
          continue
        }
        index += 1 // ']'
        return
      }
    }
    if (char === '"') {
      readString()
      return
    }
    while (index < source.length && !/[,}\]\s]/.test(source[index])) index += 1
  }

  readValue('')
  return duplicates
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

const enRaw = read('en')
const hiRaw = read('hi')
const en = leaves(JSON.parse(enRaw) as Json)
const hi = leaves(JSON.parse(hiRaw) as Json)
const enMap = new Map(en)
const hiMap = new Map(hi)

describe('locale parity (en.json and hi.json)', () => {
  // Inventory history (each change is intentional and recorded):
  //  616 at b55f804 (V09 coverage, docs/v09-i18n-coverage.md)
  //  +33 from the teammate guide/photo integration (d7b73f7): guide.*, guide.fbGuide.*,
  //      tools.protectiveGloves, tools.safetyGlasses. Kept as text; their presence does
  //      not authorize showing generated guides (V05 gate, tests/guide-policy.test.tsx).
  //  +1  landing.trustSubtitle (3c61d94)
  //  = 650. The 79 EN keys 3c61d94 removed were restored from b55f804, not added.
  //  +11 landing.demo.* used by InteractiveRepairDemo (3c61d94 referenced them but never
  //      added them, so the page showed raw keys). Copy is labelled as an illustration.
  //  = 661.
  //  +8  diagnosis.saveStatus.signInRequired and diagnosis.saveError.* (7): the guest
  //      prompt (D3) and localized save-failure reasons (D7).
  //  -1  diagnosis.issueNameMissing: its only use was an unreachable branch (D7).
  //  = 668.
  //  +1  diagnosis.saveError.timedOut: the bounded save wait (D9).
  //  = 669.
  //  +5  diagnosis.saveStatus.alreadyCompleted, diagnosis.saveError.sessionCompleted and
  //      diagnosis.viewFinishedRepair (D14); diagnosis.claim.body/action (D16).
  //  = 674.
  //  +1  diagnosis.saveError.sessionAlreadyExists: the prepared 23505 handling (D17).
  //  = 675.
  //  +1  diagnosis.claim.photoNotSaved: the guest-claim photo notice (D19 option C).
  //  = 676.
  //  +1  diagnosis.claim.sameTab: log in in this tab to keep a guest result (D20).
  //  = 677.
  it('each file currently has exactly 677 translated keys', () => {
    expect(en).toHaveLength(677)
    expect(hi).toHaveLength(677)
  })

  it('both files have identical key sets', () => {
    const onlyEn = [...enMap.keys()].filter((key) => !hiMap.has(key))
    const onlyHi = [...hiMap.keys()].filter((key) => !enMap.has(key))
    expect({ onlyEn, onlyHi }).toEqual({ onlyEn: [], onlyHi: [] })
  })

  it('has no duplicate keys inside any object in either file', () => {
    expect(findDuplicateKeys(enRaw)).toEqual([])
    expect(findDuplicateKeys(hiRaw)).toEqual([])
  })

  it('detects a duplicate key when one exists (guards the checker itself)', () => {
    expect(findDuplicateKeys('{"a":{"b":"1","b":"2"}}')).toEqual(['a.b'])
  })

  it('uses the same {placeholders} in both languages for every key', () => {
    const mismatched = [...enMap.entries()]
      .filter(([key, text]) => placeholders(text).join() !== placeholders(hiMap.get(key) ?? '').join())
      .map(([key]) => key)
    expect(mismatched).toEqual([])
  })

  it('has no empty values except the two intentionally empty share fragments', () => {
    const emptyEn = en.filter(([, text]) => text.trim() === '').map(([key]) => key)
    const emptyHi = hi.filter(([, text]) => text.trim() === '').map(([key]) => key)
    expect(emptyEn).toEqual(['completion.shareMiddle', 'completion.shareSuffix'])
    expect(emptyHi).toEqual(['completion.shareMiddle', 'completion.shareSuffix'])
  })

  it('keeps the brand name and the emergency number 112 in Hindi text', () => {
    expect(hiMap.get('common.brandName')).toBe('HomeGenie')
    const emergencyKeys = [...enMap.entries()].filter(([, text]) => text.includes('112')).map(([key]) => key)
    expect(emergencyKeys.length).toBeGreaterThan(0)
    for (const key of emergencyKeys) expect(hiMap.get(key)).toContain('112')
  })
})
