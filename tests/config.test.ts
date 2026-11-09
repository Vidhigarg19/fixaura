import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { env, isDevBuild } from '../src/config/env'
import {
  CAPTURE_DRAFT_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
  SESSION_STORAGE_KEY,
} from '../src/config/storageKeys'
import * as limits from '../src/config/limits'
import {
  GOOGLE_MAPS_SEARCH_URL,
  OSM_COPYRIGHT_URL,
  OVERPASS_ENDPOINTS,
  googleMapsDirectionsUrl,
} from '../src/config/externalUrls'
import { LANDING_CATEGORY_IMAGES, LANDING_FEATURE_IMAGES, LANDING_PREVIEW_IMAGE } from '../src/config/landingMedia'

// Guards for src/config: single environment reader, frozen storage keys, unchanged limits and URLs.

const root = process.cwd()

function sourceFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: root, encoding: 'utf8' })
  return out
    .split(/\r?\n/)
    .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts'))
}

/** Removes // and block comments so words inside comments are not counted as code. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

describe('environment is read in one place', () => {
  it('only files inside src/config read import.meta.env', () => {
    const readers = sourceFiles().filter((file) =>
      /import\.meta\.env/.test(stripComments(readFileSync(resolve(root, file), 'utf8')))
    )
    // env.ts is the typed app environment. devFixtures.ts repeats the DEV check next to its
    // import() calls so production builds drop the fixture modules (see that file's comment).
    expect(readers).toEqual(['src/config/devFixtures.ts', 'src/config/env.ts'])
  })

  it('exposes typed values and a development flag', () => {
    expect(typeof isDevBuild).toBe('boolean')
    expect(env.isDev).toBe(isDevBuild)
    expect(env.fixturesFlagEnabled).toBe(false) // test config sets VITE_ENABLE_FIXTURES=false
    expect(env.supabaseUrl).toBeTruthy()
    expect(env.supabasePublishableKey).toBeTruthy()
    expect(Object.isFrozen(env)).toBe(true)
  })
})

describe('storage keys keep their exact values', () => {
  it('has the three frozen literals', () => {
    expect(LOCALE_STORAGE_KEY).toBe('fixaura-locale')
    expect(SESSION_STORAGE_KEY).toBe('fixaura-session')
    expect(CAPTURE_DRAFT_STORAGE_KEY).toBe('homegenie-capture-draft')
  })
})

describe('limits and external URLs keep their values', () => {
  it('limits are unchanged', () => {
    expect(limits.MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024)
    expect(limits.MAX_PRIVATE_MEDIA_BYTES).toBe(5 * 1024 * 1024)
    expect(limits.MAX_DESCRIPTION_LENGTH).toBe(500)
    expect(limits.MAX_ISSUE_NAME_LENGTH).toBe(80)
    expect(limits.MAX_DRAFT_LENGTH).toBe(500)
    expect(limits.SLOW_REQUEST_MS).toBe(15000)
    expect(limits.CONFIDENCE_THRESHOLD).toBe(70)
    expect([...limits.NEARBY_RADII_KM]).toEqual([3, 5, 10, 20])
    expect(limits.NEARBY_TOTAL_TIMEOUT_MS).toBe(30000)
    expect(limits.NEARBY_ENDPOINT_TIMEOUT_MS).toBe(18000)
    expect(limits.NEARBY_CACHE_TTL_MS).toBe(120000)
    expect(limits.NEARBY_CACHE_MAX_ENTRIES).toBe(10)
    expect({ ...limits.GEOLOCATION_OPTIONS }).toEqual({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 })
  })

  it('external addresses are unchanged', () => {
    expect(OVERPASS_ENDPOINTS).toEqual([
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ])
    expect(GOOGLE_MAPS_SEARCH_URL).toBe('https://www.google.com/maps/search/')
    expect(googleMapsDirectionsUrl(12.5, 77.25)).toBe('https://www.google.com/maps/dir/?api=1&destination=12.5,77.25')
    expect(OSM_COPYRIGHT_URL).toBe('https://www.openstreetmap.org/copyright')
  })

  it('landing images are all https addresses and there are 4 + 6 + 1', () => {
    const all = [
      ...Object.values(LANDING_FEATURE_IMAGES),
      ...Object.values(LANDING_CATEGORY_IMAGES),
      LANDING_PREVIEW_IMAGE,
    ]
    expect(all).toHaveLength(11)
    for (const url of all) expect(url.startsWith('https://')).toBe(true)
  })
})
