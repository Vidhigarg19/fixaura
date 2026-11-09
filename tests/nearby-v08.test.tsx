import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { t } from '../src/i18n'
import NearbyShops from '../src/Pages/NearbyShops'
import * as nearbyService from '../src/services/nearbyShops'
import type { NearbyShop } from '../src/services/nearbyShops'

// The directory search is replaced; the real helpers (area check, Google Maps link) are kept.
vi.mock('../src/services/nearbyShops', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/nearbyShops')>()
  return { ...actual, findNearbyShops: vi.fn() }
})

// V08: nearby help is honest. Failures and empty results are said plainly, results are
// labelled as unverified directory data, and "open in Google Maps" is an external handoff.

const findNearbyShops = vi.mocked(nearbyService.findNearbyShops)
const { NearbySearchError } = nearbyService

const SHOP: NearbyShop = {
  id: 'node-1',
  name: 'City Appliance Repair',
  type: 'repair',
  distance: 1.24,
  latitude: 12.9716,
  longitude: 77.5946,
  address: '12 MG Road',
  openingHours: 'Mo-Sa 09:00-18:00',
  phone: '+91 80 1234 5678',
  website: 'https://repair.example.test/',
  category: 'appliance',
}

type GeoSuccess = (position: { coords: { latitude: number; longitude: number } }) => void
type GeoFailure = (error: { code: number; PERMISSION_DENIED: 1; POSITION_UNAVAILABLE: 2; TIMEOUT: 3 }) => void

function stubLocation(
  behaviour: 'allow' | 'deny' | 'unavailable' | 'timeout',
  coords = { latitude: 12.97161, longitude: 77.59461 }
) {
  const getCurrentPosition = vi.fn((success: GeoSuccess, failure: GeoFailure) => {
    if (behaviour === 'allow') {
      success({ coords })
      return
    }
    const code = behaviour === 'deny' ? 1 : behaviour === 'unavailable' ? 2 : 3
    failure({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
  })
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  return getCurrentPosition
}

function setSecureContext(value: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true })
}

function renderNearby(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/nearby-shops${search}`]}>
      <NearbyShops />
    </MemoryRouter>
  )
}

const findNearMe = () => screen.getByRole('button', { name: t('nearby.findNearMe') })

/** Links whose destination is a Google Maps search page. */
const mapsSearchLinks = () =>
  screen
    .getAllByRole('link', { name: t('nearby.searchGoogleMaps') })
    .filter((link) => (link as HTMLAnchorElement).href.startsWith('https://www.google.com/maps/search/'))

beforeEach(() => {
  findNearbyShops.mockReset()
  setSecureContext(true)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('nearby help: before searching', () => {
  it('does not ask for location or search until the user presses the button', () => {
    const getCurrentPosition = stubLocation('allow')
    renderNearby()
    expect(screen.getByText(t('nearby.locationNotRequested'))).toBeTruthy()
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(findNearbyShops).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('says what is shared with the directory before any request is made', () => {
    stubLocation('allow')
    renderNearby()
    expect(screen.getByText(t('nearby.locationPermissionMessage'))).toBeTruthy()
    expect(screen.getByText(t('nearby.attributionNote'), { exact: false })).toBeTruthy()
  })
})

describe('nearby help: location failures are honest', () => {
  it('permission denied: says so, offers retry and an external search', async () => {
    stubLocation('deny')
    renderNearby()
    fireEvent.click(findNearMe())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(t('nearby.locationDenied'))
    expect(screen.getByRole('button', { name: t('nearby.tryAgain') })).toBeTruthy()
    expect(mapsSearchLinks().length).toBeGreaterThan(0)
    expect(findNearbyShops).not.toHaveBeenCalled()
  })

  it('position unavailable and timeout have their own messages', async () => {
    stubLocation('unavailable')
    const first = renderNearby()
    fireEvent.click(findNearMe())
    expect((await screen.findByRole('alert')).textContent).toBe(t('nearby.locationUnavailable'))
    first.unmount()

    stubLocation('timeout')
    renderNearby()
    fireEvent.click(findNearMe())
    expect((await screen.findByRole('alert')).textContent).toBe(t('nearby.locationTimeout'))
  })

  it('insecure page: explains HTTPS is needed and offers no pointless retry', async () => {
    setSecureContext(false)
    stubLocation('allow')
    renderNearby()
    fireEvent.click(findNearMe())
    expect((await screen.findByRole('alert')).textContent).toBe(t('nearby.secureContextRequired'))
    expect(screen.queryByRole('button', { name: t('nearby.tryAgain') })).toBeNull()
    expect(mapsSearchLinks().length).toBeGreaterThan(0)
  })

  it('browser without geolocation: says it is unavailable', async () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
    renderNearby()
    fireEvent.click(findNearMe())
    expect((await screen.findByRole('alert')).textContent).toBe(t('nearby.geolocationUnsupported'))
  })

  it('impossible coordinates from the browser are rejected, not searched', async () => {
    stubLocation('allow', { latitude: 123, longitude: 10 })
    renderNearby()
    fireEvent.click(findNearMe())
    expect((await screen.findByRole('alert')).textContent).toBe(t('nearby.invalidCoordinates'))
    expect(findNearbyShops).not.toHaveBeenCalled()
  })
})

describe('nearby help: search outcomes are honest', () => {
  it('no listings: says the directory may be incomplete and suggests a wider radius', async () => {
    stubLocation('allow')
    findNearbyShops.mockResolvedValue([])
    renderNearby()
    fireEvent.click(findNearMe())
    expect(await screen.findByText(t('nearby.empty'))).toBeTruthy()
    expect(screen.getByText(t('nearby.increaseRadius5'))).toBeTruthy()
    expect(mapsSearchLinks().length).toBeGreaterThan(0)
  })

  it.each([
    ['busy', 'nearby.errorBusy'],
    ['timeout', 'nearby.errorTimeout'],
    ['offline', 'nearby.internetUnavailable'],
    ['unavailable', 'nearby.overpassUnavailable'],
  ] as const)('directory failure "%s" shows its own message, a retry and an external search', async (code, key) => {
    stubLocation('allow')
    findNearbyShops.mockRejectedValue(new NearbySearchError(code))
    renderNearby()
    fireEvent.click(findNearMe())
    const alert = await screen.findByText(t(key))
    expect(alert.getAttribute('role')).toBe('alert')
    expect(screen.getByRole('button', { name: t('nearby.tryAgain') })).toBeTruthy()
    expect(mapsSearchLinks().length).toBeGreaterThan(0)
  })

  it('an unexpected error is treated as "directory unavailable", never as an empty result', async () => {
    stubLocation('allow')
    findNearbyShops.mockRejectedValue(new Error('boom'))
    renderNearby()
    fireEvent.click(findNearMe())
    expect(await screen.findByText(t('nearby.overpassUnavailable'))).toBeTruthy()
    expect(screen.queryByText(t('nearby.empty'))).toBeNull()
  })

  it('results: shows distance as a straight line, links out to Google Maps directions, and credits OpenStreetMap', async () => {
    stubLocation('allow')
    findNearbyShops.mockResolvedValue([SHOP])
    renderNearby()
    fireEvent.click(findNearMe())

    expect(await screen.findByRole('heading', { name: SHOP.name })).toBeTruthy()
    expect(screen.getByText(t('nearby.distanceSuffix'), { exact: false })).toBeTruthy()

    const directions = screen.getByRole('link', { name: t('nearby.directions') }) as HTMLAnchorElement
    expect(directions.href).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${SHOP.latitude},${SHOP.longitude}`
    )
    expect(directions.target).toBe('_blank')
    expect(directions.rel).toBe('noopener noreferrer')

    const attribution = screen.getByRole('link', { name: t('nearby.attributionLink') }) as HTMLAnchorElement
    expect(attribution.href).toBe('https://www.openstreetmap.org/copyright')
    expect(screen.getByText(t('nearby.attributionNote'), { exact: false })).toBeTruthy()
    expect(screen.getAllByText(t('nearby.externalNote'), { exact: false }).length).toBeGreaterThan(0)
  })

  it('the search sends only rounded coordinates to Google Maps, and says so', async () => {
    stubLocation('allow', { latitude: 12.97161, longitude: 77.59461 })
    findNearbyShops.mockResolvedValue([])
    renderNearby('?appliance=Dripping%20tap')
    fireEvent.click(findNearMe())
    await screen.findByText(t('nearby.empty'))
    const link = mapsSearchLinks()[0] as HTMLAnchorElement
    const query = new URL(link.href).searchParams.get('query') ?? ''
    expect(query).toContain('Dripping tap')
    expect(query).toContain('12.972,77.595')
    expect(query).not.toContain('12.97161')
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
    expect(screen.getByText(t('nearby.externalLocationNote'), { exact: false })).toBeTruthy()
  })
})

describe('nearby help: search by city or area is only a handoff', () => {
  it('rejects text that is too short and opens nothing', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    stubLocation('allow')
    renderNearby()
    fireEvent.change(screen.getByLabelText(t('nearby.areaLabel')), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: t('nearby.searchGoogleMaps') }))
    expect((await screen.findByRole('alert')).textContent).toBe(t('nearby.areaInvalid'))
    expect(open).not.toHaveBeenCalled()
  })

  it('a valid area opens Google Maps in a new tab with no opener, and calls no directory or location API', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const getCurrentPosition = stubLocation('allow')
    renderNearby()
    fireEvent.change(screen.getByLabelText(t('nearby.areaLabel')), { target: { value: 'Indiranagar, Bengaluru' } })
    fireEvent.click(screen.getByRole('button', { name: t('nearby.searchGoogleMaps') }))

    await waitFor(() => expect(open).toHaveBeenCalledTimes(1))
    const [url, target, features] = open.mock.calls[0] as [string, string, string]
    expect(url.startsWith('https://www.google.com/maps/search/?')).toBe(true)
    expect(new URL(url).searchParams.get('query')).toContain('Indiranagar, Bengaluru')
    expect(target).toBe('_blank')
    expect(features).toBe('noopener,noreferrer')
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(findNearbyShops).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('states that HomeGenie does not look the place up', () => {
    stubLocation('allow')
    renderNearby()
    expect(screen.getByText(t('nearby.areaHelp'))).toBeTruthy()
  })
})

