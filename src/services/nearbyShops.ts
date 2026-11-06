export type NearbyShopType = 'repair' | 'sell' | 'both'

export interface NearbyShop {
  id: string
  name: string
  type: NearbyShopType
  /** Approximate straight-line distance in km, calculated from coordinates. */
  distance: number
  latitude: number
  longitude: number
  address: string
  phone: string
  /** Normalized http(s) URL, or '' when the listing has no valid website. */
  website: string
  openingHours: string
  category: string
}

export type NearbySearchErrorCode =
  | 'invalid_input'
  | 'offline'
  | 'busy'
  | 'timeout'
  | 'unavailable'
  | 'cancelled'

/** Error with a stable code only. It never carries raw server text or coordinates. */
export class NearbySearchError extends Error {
  readonly code: NearbySearchErrorCode

  constructor(code: NearbySearchErrorCode) {
    super(code)
    this.name = 'NearbySearchError'
    this.code = code
  }
}

type EndpointFailureCode = 'busy' | 'timeout' | 'offline' | 'unavailable'

class EndpointFailure extends Error {
  readonly code: EndpointFailureCode

  constructor(code: EndpointFailureCode) {
    super(code)
    this.name = 'EndpointFailure'
    this.code = code
  }
}

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements?: OverpassElement[]
  remark?: string
}

// Only the two endpoints that were already in use. Do not add more public mirrors.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const SHOP_VALUES = 'appliance|electronics|hardware|mobile_phone|computer'
const CRAFT_VALUES = 'electronics_repair|electrician'

/** Upper bound for the whole search, including the failover attempt. */
const TOTAL_TIMEOUT_MS = 30000
const ENDPOINT_TIMEOUT_MS = 18000

// Short-lived, in-memory only (never written to storage). Keyed by location + radius.
// The repair/sell filter is applied on the client, so it does not change the request.
const CACHE_TTL_MS = 2 * 60 * 1000
const CACHE_MAX_ENTRIES = 10
const elementCache = new Map<string, { expiresAt: number; elements: OverpassElement[] }>()

function cacheKey(latitude: number, longitude: number, radiusKm: number) {
  return `${latitude.toFixed(4)}|${longitude.toFixed(4)}|${radiusKm}`
}

function readCache(key: string): OverpassElement[] | null {
  const entry = elementCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    elementCache.delete(key)
    return null
  }
  return entry.elements
}

function writeCache(key: string, elements: OverpassElement[]) {
  elementCache.delete(key)
  elementCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, elements })
  while (elementCache.size > CACHE_MAX_ENTRIES) {
    const oldest = elementCache.keys().next().value
    if (oldest === undefined) break
    elementCache.delete(oldest)
  }
}

function haversineDistanceKm(
  latitude: number,
  longitude: number,
  targetLatitude: number,
  targetLongitude: number
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadiusKm = 6371
  const latitudeDifference = toRadians(targetLatitude - latitude)
  const longitudeDifference = toRadians(targetLongitude - longitude)
  const value =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(toRadians(latitude)) *
      Math.cos(toRadians(targetLatitude)) *
      Math.sin(longitudeDifference / 2) ** 2

  const boundedValue = Math.min(1, Math.max(0, value))
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(boundedValue), Math.sqrt(1 - boundedValue))
}

function buildOverpassQuery(latitude: number, longitude: number, radiusKm: number) {
  const radiusMeters = Math.round(radiusKm * 1000)
  const around = `around:${radiusMeters},${latitude},${longitude}`

  return `[out:json][timeout:25];(nwr(${around})["shop"~"^(${SHOP_VALUES})$"];nwr(${around})["craft"~"^(${CRAFT_VALUES})$"];nwr(${around})["repair"="yes"];);out center tags;`
}

function getAddress(tags: Record<string, string>): string {
  const fullAddress = tags['addr:full']?.trim()
  if (fullAddress) return fullAddress

  const street = [tags['addr:housenumber'], tags['addr:street']]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ')
  return [
    street,
    tags['addr:suburb'],
    tags['addr:place'],
    tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
    tags['addr:district'],
    tags['addr:state'],
    tags['addr:postcode'],
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ')
}

/** Returns a safe http(s) URL string, or '' if the value is missing or unsafe. */
export function normalizeWebsite(raw: string | undefined): string {
  const value = raw?.trim().split(/[;\s]/)[0] ?? ''
  if (!value || value.length > 300) return ''
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    if (url.username || url.password) return ''
    if (!url.hostname.includes('.')) return ''
    return url.href
  } catch {
    return ''
  }
}

function mapElement(
  element: OverpassElement,
  latitude: number,
  longitude: number,
  radiusKm: number
): NearbyShop | null {
  const tags = element.tags ?? {}
  const name = tags.name?.trim()
  const elementLatitude = element.lat ?? element.center?.lat
  const elementLongitude = element.lon ?? element.center?.lon
  if (
    !name ||
    !Number.isFinite(elementLatitude) ||
    !Number.isFinite(elementLongitude) ||
    elementLatitude === undefined ||
    elementLongitude === undefined ||
    elementLatitude < -90 ||
    elementLatitude > 90 ||
    elementLongitude < -180 ||
    elementLongitude > 180
  ) {
    return null
  }

  const distanceKm = haversineDistanceKm(
    latitude,
    longitude,
    elementLatitude,
    elementLongitude
  )
  if (distanceKm > radiusKm) return null

  const sells = Boolean(tags.shop && new RegExp(`^(?:${SHOP_VALUES})$`).test(tags.shop))
  const repairs =
    Boolean(tags.craft && new RegExp(`^(?:${CRAFT_VALUES})$`).test(tags.craft)) ||
    tags.repair === 'yes'
  const category = sells ? tags.shop : tags.craft || 'repair'
  // OSM often lists several numbers separated by ";". Use the first one only.
  const phone = (tags.phone || tags['contact:phone'] || '').split(/[;,]/)[0].trim()

  return {
    id: `${element.type}-${element.id}`,
    name,
    type: sells && repairs ? 'both' : repairs ? 'repair' : 'sell',
    distance: distanceKm,
    latitude: elementLatitude,
    longitude: elementLongitude,
    address: getAddress(tags),
    openingHours: tags.opening_hours?.trim() ?? '',
    phone,
    website: normalizeWebsite(tags.website || tags['contact:website']),
    category,
  }
}

function dedupeElements(elements: OverpassElement[]): OverpassElement[] {
  const uniqueElements = new Map<string, OverpassElement>()
  for (const element of elements) {
    if (
      !element ||
      !['node', 'way', 'relation'].includes(element.type) ||
      !Number.isSafeInteger(element.id)
    ) {
      continue
    }
    const key = `${element.type}-${element.id}`
    const existing = uniqueElements.get(key)
    if (existing) {
      uniqueElements.set(key, {
        ...existing,
        ...element,
        tags: { ...existing.tags, ...element.tags },
      })
    } else {
      uniqueElements.set(key, element)
    }
  }
  return [...uniqueElements.values()]
}

function toShops(
  elements: OverpassElement[],
  latitude: number,
  longitude: number,
  radiusKm: number
): NearbyShop[] {
  return elements
    .map((element) => mapElement(element, latitude, longitude, radiusKm))
    .filter((shop): shop is NearbyShop => shop !== null)
    .sort((first, second) => first.distance - second.distance)
}

function summarizeFailures(failures: EndpointFailureCode[]): NearbySearchErrorCode {
  if (failures.includes('offline')) return 'offline'
  if (failures.includes('busy')) return 'busy'
  if (failures.length === 0 || failures.every((code) => code === 'timeout')) return 'timeout'
  return 'unavailable'
}

function classifyFailure(error: unknown, timedOut: boolean): EndpointFailureCode {
  if (error instanceof EndpointFailure) return error.code
  if (timedOut) return 'timeout'
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  return 'unavailable'
}

/**
 * Searches OpenStreetMap (Overpass) listings around a point.
 * - Pass an AbortSignal to cancel; a cancelled search rejects with code 'cancelled'.
 * - The whole search, including failover, is bounded by TOTAL_TIMEOUT_MS.
 * - Rejections are NearbySearchError instances that never include raw server text.
 */
export async function findNearbyShops(
  latitude: number,
  longitude: number,
  radiusKm: number,
  signal?: AbortSignal
): Promise<NearbyShop[]> {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(radiusKm) ||
    radiusKm <= 0 ||
    radiusKm > 20
  ) {
    throw new NearbySearchError('invalid_input')
  }
  if (signal?.aborted) throw new NearbySearchError('cancelled')

  const key = cacheKey(latitude, longitude, radiusKm)
  const cached = readCache(key)
  if (cached) return toShops(cached, latitude, longitude, radiusKm)

  const query = buildOverpassQuery(latitude, longitude, radiusKm)
  const deadline = Date.now() + TOTAL_TIMEOUT_MS
  const failures: EndpointFailureCode[] = []

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const remaining = deadline - Date.now()
    if (remaining <= 1000) break

    const controller = new AbortController()
    let timedOut = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, Math.min(ENDPOINT_TIMEOUT_MS, remaining))
    const forwardAbort = () => controller.abort()
    signal?.addEventListener('abort', forwardAbort, { once: true })

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new EndpointFailure(
          response.status === 429 || response.status === 504 ? 'busy' : 'unavailable'
        )
      }

      let data: OverpassResponse
      try {
        data = (await response.json()) as OverpassResponse
      } catch {
        throw new EndpointFailure('unavailable')
      }
      if (data.remark) {
        throw new EndpointFailure(
          /timed out|rate.?limit|too many|busy|overload/i.test(data.remark)
            ? 'busy'
            : 'unavailable'
        )
      }
      if (!Array.isArray(data.elements)) {
        throw new EndpointFailure('unavailable')
      }

      const elements = dedupeElements(data.elements)
      writeCache(key, elements)
      return toShops(elements, latitude, longitude, radiusKm)
    } catch (error) {
      if (signal?.aborted) throw new NearbySearchError('cancelled')
      failures.push(classifyFailure(error, timedOut))
    } finally {
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', forwardAbort)
    }
  }

  throw new NearbySearchError(summarizeFailures(failures))
}

/** City/area text is only used to build an external search link. It is never geocoded. */
export function isValidArea(value: string): boolean {
  const text = value.trim()
  if (text.length < 2 || text.length > 80) return false
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0
    if (code < 32 || code === 127 || character === '<' || character === '>') return false
  }
  return true
}

/**
 * Builds a Google Maps search link. `area` wins over coordinates, so a user who typed an
 * area does not also send their position. Coordinates are rounded to ~100 m.
 */
export function buildExternalSearchUrl(
  terms: string,
  area: string,
  coordinates: { latitude: number; longitude: number } | null
): string {
  const parts = [terms.trim()]
  const place = area.trim()
  if (place) {
    parts.push(place)
  } else if (coordinates) {
    parts.push(`${coordinates.latitude.toFixed(3)},${coordinates.longitude.toFixed(3)}`)
  }
  const query = parts.filter(Boolean).join(' ').slice(0, 200)
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query }).toString()}`
}
