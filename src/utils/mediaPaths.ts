// Pure rules for stored photo references. No Supabase client, so they are cheap to import
// anywhere (the display hook, the media service) and easy to test.
//
// A stored photo reference can be one of:
//  - an inline data/blob URL, a site asset ("/x.png") or an external http(s) URL
//    -> the browser can load it as it is ("direct");
//  - a private bucket object path ("<userId>/<sessionId>/<uuid>.jpg")
//  - a Supabase Storage URL for the private bucket (public/sign/authenticated form)
//    -> NOT loadable as stored (a private bucket answers 403); it must be signed.

export const PRIVATE_MEDIA_BUCKET = 'repair-private-media'

// Matches a Storage URL for THIS bucket in any of its forms, so a stored public-style URL
// can be turned back into the object path and signed instead of failing with a 403.
const BUCKET_URL_RE = new RegExp(
  `/storage/v1/object/(?:public|sign|authenticated)/${PRIVATE_MEDIA_BUCKET}/([^?#]+)`
)

/** True only for strings that look like a bucket object path (not a URL, not inline data). */
export function isPrivateObjectPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('://') &&
    !value.startsWith('data:') &&
    !value.startsWith('blob:')
  )
}

/** The bucket object path for a stored value, or null when it is not a private object. */
export function extractObjectPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = trimmed.match(BUCKET_URL_RE)
  if (match) {
    try {
      return decodeURIComponent(match[1])
    } catch {
      return null
    }
  }
  // A leading "/" is a site asset, never a bucket object.
  return isPrivateObjectPath(trimmed) && !trimmed.startsWith('/') ? trimmed : null
}

/**
 * True when the value can be put straight into an <img src>: an inline data URL, a blob
 * URL, a site asset ("/..."), or an http(s) URL that is NOT our private bucket.
 */
export function isDirectMediaUrl(value: string): boolean {
  if (extractObjectPath(value)) return false
  return (
    value.startsWith('data:image/') ||
    value.startsWith('blob:') ||
    value.startsWith('/') ||
    /^https?:\/\//i.test(value)
  )
}
