// On-device copy of the user's repair photo.
//
// The photo the user took is the single most important image in the repair guide, and it
// must not disappear just because the browser cache (sessionStorage) was cleared, a new
// tab was opened, or the private storage upload failed (e.g. the bucket is not set up
// yet). This keeps a copy of the photo in IndexedDB on THIS device, keyed by the ids that
// identify the repair, so the guide can always show it again here.
//
// Privacy: the photo never leaves the device through this module. Entries are scoped to
// the signed-in user, are cleared on sign-out (see clearLocalPhotos), are removed when the
// repair is deleted, and expire after PHOTO_TTL_MS. Every call fails soft: if IndexedDB is
// unavailable (private mode, quota), the app simply falls back to the stored copy.

const DB_NAME = 'homegenie-photos'
const STORE = 'photos'
const DB_VERSION = 1
const PHOTO_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

interface PhotoRecord {
  key: string
  userId: string
  blob: Blob
  savedAt: number
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      let request: IDBOpenDBRequest
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION)
      } catch {
        resolve(null)
        return
      }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    })
  }
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null)
          return
        }
        try {
          const tx = db.transaction(STORE, mode)
          const request = work(tx.objectStore(STORE))
          tx.oncomplete = () => resolve(request ? (request.result as T) : null)
          tx.onerror = () => resolve(null)
          tx.onabort = () => resolve(null)
        } catch {
          resolve(null)
        }
      })
  )
}

/** Stores the photo under every key that identifies this repair (attempt id, session id). */
export async function savePhoto(keys: Array<string | null | undefined>, blob: Blob, userId: string): Promise<void> {
  const unique = [...new Set(keys.filter((key): key is string => typeof key === 'string' && key.length > 0))]
  if (unique.length === 0 || !userId || blob.size === 0) return
  const savedAt = Date.now()
  await run('readwrite', (store) => {
    for (const key of unique) store.put({ key, userId, blob, savedAt } satisfies PhotoRecord)
  })
}

/** The first stored photo found for these keys that belongs to this user and has not expired. */
export async function loadPhoto(keys: Array<string | null | undefined>, userId: string | null | undefined): Promise<Blob | null> {
  if (!userId) return null
  for (const key of keys) {
    if (!key) continue
    const record = await run<PhotoRecord | undefined>('readonly', (store) => store.get(key))
    if (!record || record.userId !== userId) continue
    if (Date.now() - record.savedAt > PHOTO_TTL_MS) {
      void deletePhotos([key])
      continue
    }
    return record.blob
  }
  return null
}

/** Copies an existing photo to another key (e.g. once the repair row id is known). */
export async function linkPhoto(fromKey: string | null | undefined, toKey: string | null | undefined, userId: string): Promise<void> {
  if (!fromKey || !toKey || fromKey === toKey) return
  const blob = await loadPhoto([fromKey], userId)
  if (blob) await savePhoto([toKey], blob, userId)
}

export async function deletePhotos(keys: Array<string | null | undefined>): Promise<void> {
  const unique = keys.filter((key): key is string => typeof key === 'string' && key.length > 0)
  if (unique.length === 0) return
  await run('readwrite', (store) => {
    for (const key of unique) store.delete(key)
  })
}

/** Removes every on-device photo. Called on sign-out so a shared device keeps nothing. */
export async function clearLocalPhotos(): Promise<void> {
  await run('readwrite', (store) => store.clear())
}
