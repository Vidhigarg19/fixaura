// S09 — Private media, retention and deletion.
//
// All repair photos live in a PRIVATE Supabase Storage bucket
// (`repair-private-media`). Objects are never public: reads go through
// short-lived signed URLs, and storage RLS plus owner-scoped paths keep each
// user's media private to them.
//
// Object path layout: `<userId>/<sessionId>/<uuid>.<ext>`
// The first path segment is the owner's auth uid, which the storage RLS policy
// checks (`storage.foldername(name)[1] = auth.uid()`), so one user can never
// read, overwrite, or delete another user's media.

import { supabase } from '../lib/supabase'
import { MAX_PRIVATE_MEDIA_BYTES } from '../config/limits'

export const PRIVATE_MEDIA_BUCKET = 'repair-private-media'

const MAX_FILE_SIZE = MAX_PRIVATE_MEDIA_BYTES // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number]

// Signed URLs are short-lived: long enough to render, short enough that a leaked
// link expires quickly. Raw images are never exposed via a public URL.
const SIGNED_URL_TTL_SECONDS = 60 * 10 // 10 minutes

const EXTENSION_BY_MIME: Record<AllowedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function isAllowedMime(value: string): value is AllowedMime {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value)
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(`Unable to verify your account: ${error.message}`)
  const userId = data.user?.id
  if (!userId) throw new Error('You must be signed in to manage repair media.')
  return userId
}

/**
 * Uploads a repair photo to the private bucket after strict validation.
 *
 * Validation (fail-closed):
 *  - MIME type must be image/jpeg, image/png, or image/webp.
 *  - Size must be at most 5 MB.
 *
 * Returns the storage object path (NOT a URL). Callers store this path on the
 * session / observation row; render it later via `getPrivateMediaUrl`.
 */
export async function uploadPrivateRepairMedia(file: File, sessionId: string): Promise<string> {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('A repair session is required before uploading media.')
  }

  // Validate MIME type against the real file type (never trust the extension).
  if (!isAllowedMime(file.type)) {
    throw new Error('Invalid file type. Only JPEG, PNG, and WebP images are permitted.')
  }

  // Validate size. Reject empty files too: they are never a real photo.
  if (file.size === 0) {
    throw new Error('The selected image is empty.')
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File size exceeds the maximum allowed limit of 5MB.')
  }

  const userId = await requireUserId()

  // Derive the extension from the validated MIME type, not from file.name, so a
  // crafted filename can never influence the stored object path.
  const ext = EXTENSION_BY_MIME[file.type]
  const objectPath = `${userId}/${sessionId}/${crypto.randomUUID()}.${ext}`

  const { data, error } = await supabase.storage
    .from(PRIVATE_MEDIA_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type,
      cacheControl: '3600',
      // Never overwrite an existing object: each upload gets a fresh uuid, and
      // upsert:false means a (near-impossible) collision fails loudly.
      upsert: false,
    })

  if (error) throw new Error(`Unable to upload the image: ${error.message}`)
  return data.path
}

/**
 * Convenience for callers that hold a Blob (e.g. a camera capture) rather than
 * a File. Wraps the Blob in a File with a MIME-derived name and delegates to
 * `uploadPrivateRepairMedia`, so the same strict validation applies.
 */
export async function uploadPrivateRepairMediaBlob(blob: Blob, sessionId: string): Promise<string> {
  const type = blob.type || 'image/jpeg'
  if (!isAllowedMime(type)) {
    throw new Error('Invalid file type. Only JPEG, PNG, and WebP images are permitted.')
  }
  const file = new File([blob], `capture.${EXTENSION_BY_MIME[type]}`, { type })
  return uploadPrivateRepairMedia(file, sessionId)
}

/**
 * Creates a short-lived signed URL for reading one private object. The private
 * bucket has no public URL, so this is the only way to render stored media.
 * Returns null when the object is missing or the user may not read it.
 */
export async function getPrivateMediaUrl(
  objectPath: string,
  expiresInSeconds: number = SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  if (!objectPath) return null
  const { data, error } = await supabase.storage
    .from(PRIVATE_MEDIA_BUCKET)
    .createSignedUrl(objectPath, expiresInSeconds)
  if (error) {
    // RLS denial or a missing object: do not leak why, just fail to a null URL.
    console.warn('Unable to sign media URL:', error.message)
    return null
  }
  return data.signedUrl
}

/**
 * Collects every private-storage object path linked to a session so deletion
 * can scrub them. Reads the before/after image paths recorded on
 * `repair_observations`. Values that are not bucket object paths (e.g. legacy
 * data: URLs or absolute http URLs) are ignored — only real private objects are
 * returned, so we never try to "delete" something that isn't ours to delete.
 */
export async function collectSessionAssetPaths(sessionId: string): Promise<string[]> {
  if (!sessionId) return []
  const { data, error } = await supabase
    .from('repair_observations')
    .select('before_image_url, after_image_url')
    .eq('session_id', sessionId)

  if (error) {
    console.warn('Unable to list session media for cleanup:', error.message)
    return []
  }

  const paths = new Set<string>()
  for (const row of data ?? []) {
    for (const value of [row.before_image_url, row.after_image_url]) {
      if (isPrivateObjectPath(value)) paths.add(value)
    }
  }
  return [...paths]
}

/** True only for strings that look like a bucket object path we own (not a URL). */
function isPrivateObjectPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('://') &&
    !value.startsWith('data:')
  )
}

/**
 * Safely deletes a repair session: first scrubs its private storage assets,
 * then removes the database record (which cascades to repair_observations,
 * chat_messages, step progress, etc. via ON DELETE CASCADE).
 *
 * Safe-retry handling:
 *  - Storage removal is attempted in a bounded retry loop. If it still fails,
 *    we DO NOT delete the DB row — otherwise the paths would be lost and the
 *    objects orphaned forever. The caller can retry the whole operation.
 *  - The DB delete is scoped by user_id (defense in depth alongside RLS).
 */
export async function deleteRepairSessionCompletely(
  sessionId: string,
  assetPaths: string[] = []
): Promise<void> {
  if (!sessionId) throw new Error('A session id is required to delete a repair.')
  const userId = await requireUserId()

  // Combine caller-supplied paths with any recorded on the session's
  // observations, so nothing is left behind even if the caller passed none.
  const discovered = await collectSessionAssetPaths(sessionId)
  const uniquePaths = [...new Set([...(assetPaths ?? []), ...discovered])].filter(isPrivateObjectPath)

  if (uniquePaths.length > 0) {
    const removed = await removeWithRetry(uniquePaths)
    if (!removed) {
      // Fail closed: keep the DB row so the paths are still discoverable on
      // retry, rather than orphaning private objects.
      throw new Error('Could not remove all stored images. The repair was not deleted; please try again.')
    }
  }

  const { error: dbError } = await supabase
    .from('repair_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId)

  if (dbError) throw new Error(`Unable to delete this repair: ${dbError.message}`)
}

/** Removes objects from the private bucket with a small bounded retry. */
async function removeWithRetry(paths: string[], attempts = 3): Promise<boolean> {
  let lastError: string | null = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { error } = await supabase.storage.from(PRIVATE_MEDIA_BUCKET).remove(paths)
    if (!error) return true
    lastError = error.message
    // Brief backoff before retrying a transient storage error.
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)))
  }
  console.error('Storage asset cleanup failed after retries:', lastError)
  return false
}
