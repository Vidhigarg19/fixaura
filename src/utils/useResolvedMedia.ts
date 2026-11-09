import { useCallback, useEffect, useState } from 'react'
import { forgetSignedUrl, resolveMediaUrl } from '../services/mediaService'
import { isDirectMediaUrl } from './mediaPaths'

// Turns "whatever is stored for a photo" into a URL an <img> can load, and reports a clear
// status so the UI never renders an empty box without knowing why.
//
//  - inline data URLs, blob URLs, site assets and external URLs are used as they are;
//  - a private storage path (or a stored storage URL for the private bucket) is exchanged
//    for a short-lived signed URL, so it loads securely instead of failing with a 403;
//  - if the browser fails to load a signed URL (typically because it expired), it is
//    re-signed ONCE before giving up.

export type MediaStatus = 'none' | 'loading' | 'ready' | 'error'

export interface ResolvedMedia {
  src: string | null
  status: MediaStatus
  /** Pass to the <img onError>. Re-signs a private URL once, then reports an error. */
  onError: () => void
}

export function useResolvedMedia(candidate: string | null | undefined): ResolvedMedia {
  const value = candidate && candidate.trim() ? candidate.trim() : null
  const direct = value !== null && isDirectMediaUrl(value)

  // `bump` forces a fresh signature; `retriedFor` makes sure each photo is retried only once.
  const [bump, setBump] = useState(0)
  const [retriedFor, setRetriedFor] = useState<string | null>(null)
  const [resolved, setResolved] = useState<{ key: string; url: string | null } | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const key = value === null ? null : `${value}#${bump}`

  useEffect(() => {
    if (value === null || direct) return
    let alive = true
    resolveMediaUrl(value)
      .catch(() => null)
      .then((url) => {
        if (alive) setResolved({ key: `${value}#${bump}`, url })
      })
    return () => {
      alive = false
    }
  }, [value, direct, bump])

  const onError = useCallback(() => {
    if (value === null || key === null) return
    if (!direct && retriedFor !== value) {
      forgetSignedUrl(value)
      setRetriedFor(value)
      setBump((current) => current + 1)
      return
    }
    setFailedKey(key)
  }, [value, direct, key, retriedFor])

  let src: string | null = null
  let status: MediaStatus = 'none'
  if (value !== null && key !== null) {
    if (failedKey === key) {
      status = 'error'
    } else if (direct) {
      src = value
      status = 'ready'
    } else if (resolved?.key === key) {
      src = resolved.url
      status = resolved.url ? 'ready' : 'error'
    } else {
      status = 'loading'
    }
  }

  return { src, status, onError }
}
