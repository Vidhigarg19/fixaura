// S09: keeps the just-captured photo with the repair. Moved out of CameraCapture so it
// can be tested on its own; the behaviour is unchanged except for the log wording.
//
// Order: on-device copy first (works without storage), then the private-bucket upload and
// the cache paths, then (if the repair row already exists) the row's image_path. Every
// step is best-effort and never throws into the analyze flow.

import { getSession, saveSession } from './repairSession'
import { uploadPrivateRepairMediaBlob } from './mediaService'
import { persistImagePath } from './repairSessionDb'
import { savePhoto } from './localPhotoStore'

export async function persistCaptureMedia(blob: Blob, userId: string): Promise<void> {
  const session = getSession()
  // Keep an on-device copy FIRST. It does not depend on storage being set up, so the
  // guide can always show the user's own photo on this device (reload, new tab, resume).
  try {
    await savePhoto(
      [session?.diagnosisAttemptId, session?.diagnosisPersistence?.repairSessionId],
      blob,
      userId
    )
  } catch {
    // Optional: the stored copy below (or this tab's cache) still covers the guide.
  }

  let path: string
  let current: ReturnType<typeof getSession>
  try {
    const sessionScope = session?.diagnosisPersistence?.repairSessionId ?? session?.diagnosisAttemptId
    if (!sessionScope) return
    path = await uploadPrivateRepairMediaBlob(blob, sessionScope)
    current = getSession()
    const mediaPaths = [...new Set([...(current?.mediaPaths ?? []), path])]
    saveSession({ mediaPaths, imagePath: current?.imagePath ?? path })
  } catch (error) {
    console.warn('Private media upload failed:', error instanceof Error ? error.message : 'unknown')
    return
  }

  // If the repair row already exists, record the photo on it now so it survives a new
  // tab or a resume. If it does not exist yet, the Diagnosis page writes it with the row.
  // The upload above already succeeded, so a failure here is only the path update.
  try {
    const repairSessionId = getSession()?.diagnosisPersistence?.repairSessionId
    if (repairSessionId) await persistImagePath(repairSessionId, current?.imagePath ?? path)
  } catch (error) {
    console.warn(
      'Recording the uploaded photo on the repair failed:',
      error instanceof Error ? error.message : 'unknown'
    )
  }
}
