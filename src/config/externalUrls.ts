// External web addresses used by the app. No keys or user data belong here.

/** Public OpenStreetMap (Overpass) directory servers, tried in order. Do not add more mirrors. */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

/** Google Maps search page; the caller appends `?api=1&query=...`. */
export const GOOGLE_MAPS_SEARCH_URL = 'https://www.google.com/maps/search/'

/** Google Maps directions link to a point. */
export function googleMapsDirectionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
}

/** Attribution link required for OpenStreetMap data. */
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright'
