export type NearbyShopType = 'repair' | 'sell' | 'both'

export interface NearbyShop {
  id: string
  name: string
  type: NearbyShopType
  distance: number
  latitude: number
  longitude: number
  address: string
  phone: string
  openingHours: string
  category: string
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

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const SHOP_VALUES = 'appliance|electronics|hardware|mobile_phone|computer'
const CRAFT_VALUES = 'electronics_repair|electrician'

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
  const phone = tags.phone?.trim() || tags['contact:phone']?.trim() || ''

  return {
    id: `${element.type}-${element.id}`,
    name,
    type: sells && repairs ? 'both' : repairs ? 'repair' : 'sell',
    distance: distanceKm,
    latitude: elementLatitude,
    longitude: elementLongitude,
    address: getAddress(tags),
    openingHours: tags.opening_hours ?? '',
    phone,
    category,
  }
}

export async function findNearbyShops(
  latitude: number,
  longitude: number,
  radiusKm: number
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
    throw new Error('A valid location and search radius are required.')
  }

  const query = buildOverpassQuery(latitude, longitude, radiusKm)
  const failures: string[] = []

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 30000)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim())
      }

      const data = (await response.json()) as OverpassResponse
      if (data.remark) {
        throw new Error(data.remark)
      }
      if (!Array.isArray(data.elements)) {
        throw new Error('Overpass returned an invalid response.')
      }

      const uniqueElements = new Map<string, OverpassElement>()
      for (const element of data.elements) {
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
        .map((element) => mapElement(element, latitude, longitude, radiusKm))
        .filter((shop): shop is NearbyShop => shop !== null)
        .sort((first, second) => first.distance - second.distance)
    } catch (error) {
      failures.push(
        `${endpoint}: ${
          error instanceof DOMException && error.name === 'AbortError'
            ? 'Request timed out.'
            : error instanceof Error
              ? error.message
              : 'Unknown request error'
        }`
      )
    } finally {
      window.clearTimeout(timeout)
    }
  }

  throw new Error(`All Overpass endpoints failed. ${failures.join(' ')}`)
}
