import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RepairSession } from '../types/repair'
import { loadPhoto } from '../services/localPhotoStore'
import { useResolvedMedia, type ResolvedMedia } from './useResolvedMedia'

// The repair's MAIN photo (the one the user took at the start), found through every place
// it can live, best first:
//   1. this tab's capture         session.imageDataUrl          (instant, no network)
//   2. the on-device copy         IndexedDB, by attempt/repair id (survives reload / new tab)
//   3. the stored private object  image_path / mediaPaths       (signed URL, any device)
// Each source that fails to load moves on to the next, so one broken source (an expired
// URL, a missing bucket, a cleared cache) never leaves the guide without the user's photo.

function useDevicePhoto(keys: Array<string | undefined>, userId: string | undefined) {
  const keyString = keys.filter(Boolean).join('|')
  const [result, setResult] = useState<{ key: string; url: string | null } | null>(null)

  useEffect(() => {
    if (!keyString || !userId) return
    let alive = true
    let objectUrl: string | null = null
    loadPhoto(keyString.split('|'), userId)
      .catch(() => null)
      .then((blob) => {
        if (!alive) return
        objectUrl = blob ? URL.createObjectURL(blob) : null
        setResult({ key: `${keyString}#${userId}`, url: objectUrl })
      })
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [keyString, userId])

  const current = keyString && userId && result?.key === `${keyString}#${userId}` ? result : null
  return {
    url: current?.url ?? null,
    loading: Boolean(keyString && userId) && current === null,
  }
}

export function useRepairPhoto(session: RepairSession | null | undefined): ResolvedMedia {
  const inline = session?.imageDataUrl?.startsWith('data:image/') ? session.imageDataUrl : null
  const stored = session?.imagePath ?? session?.mediaPaths?.[0] ?? null
  const device = useDevicePhoto(
    [session?.diagnosisAttemptId, session?.diagnosisPersistence?.repairSessionId, session?.historySessionId],
    session?.ownerUserId ?? session?.diagnosisPersistence?.userId
  )
  const storedMedia = useResolvedMedia(stored)

  // Sources the browser has rejected (onError) for this repair, by value.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const markFailed = useCallback((value: string) => {
    setFailed((current) => (current.has(value) ? current : new Set(current).add(value)))
  }, [])

  return useMemo<ResolvedMedia>(() => {
    if (inline && !failed.has(inline)) {
      return { src: inline, status: 'ready', onError: () => markFailed(inline) }
    }
    if (device.url && !failed.has(device.url)) {
      const url = device.url
      return { src: url, status: 'ready', onError: () => markFailed(url) }
    }
    if (device.loading) return { src: null, status: 'loading', onError: () => undefined }
    if (stored) return storedMedia
    return { src: null, status: 'none', onError: () => undefined }
  }, [inline, device.url, device.loading, stored, storedMedia, failed, markFailed])
}
