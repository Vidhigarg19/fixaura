import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { persistCaptureMedia } from '../src/services/captureMedia'
import { getSession, saveSession } from '../src/services/repairSession'
import { uploadPrivateRepairMediaBlob } from '../src/services/mediaService'
import { persistImagePath } from '../src/services/repairSessionDb'
import { makeDiagnosis } from './helpers/fixtures'

vi.mock('../src/lib/supabase', async () => ({ supabase: (await import('./helpers/persistenceFake')).supabase }))
vi.mock('../src/services/mediaService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/mediaService')>()),
  uploadPrivateRepairMediaBlob: vi.fn(),
}))
vi.mock('../src/services/repairSessionDb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/repairSessionDb')>()),
  persistImagePath: vi.fn(),
}))

// The capture photo bookkeeping (moved out of CameraCapture unchanged) now logs an upload
// failure and a later path-update failure with different, accurate wording.

const upload = vi.mocked(uploadPrivateRepairMediaBlob)
const recordPath = vi.mocked(persistImagePath)
const USER_ID = 'user-1'
const ROW_ID = '3f2b8a4e-1c5d-4e6f-8a9b-0c1d2e3f4a5b'
const photo = () => new Blob(['pixels'], { type: 'image/jpeg' })

let warn: MockInstance<(...args: unknown[]) => void>

beforeEach(() => {
  upload.mockReset()
  recordPath.mockReset()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  saveSession({ diagnosis: makeDiagnosis(), ownerUserId: USER_ID, diagnosisAttemptId: 'attempt-1' })
})

afterEach(() => {
  warn.mockRestore()
})

const warned = (prefix: string) => warn.mock.calls.filter((args) => args[0] === prefix)

describe('persistCaptureMedia logging', () => {
  it('an upload failure is logged as an upload failure and records nothing', async () => {
    upload.mockRejectedValueOnce(new Error('Unable to upload the image: bucket not found'))
    await persistCaptureMedia(photo(), USER_ID)

    expect(warned('Private media upload failed:')).toEqual([
      ['Private media upload failed:', 'Unable to upload the image: bucket not found'],
    ])
    expect(warned('Recording the uploaded photo on the repair failed:')).toEqual([])
    expect(recordPath).not.toHaveBeenCalled()
    expect(getSession()?.mediaPaths).toBeUndefined()
  })

  it('a path-update failure after a good upload is logged as such, not as an upload failure', async () => {
    saveSession({ diagnosisPersistence: { userId: USER_ID, repairSessionId: ROW_ID } })
    upload.mockResolvedValueOnce('user-1/row/photo.jpg')
    recordPath.mockRejectedValueOnce(new Error('Unable to save the photo reference: the repair was not changed'))
    await persistCaptureMedia(photo(), USER_ID)

    expect(warned('Private media upload failed:')).toEqual([])
    expect(warned('Recording the uploaded photo on the repair failed:')).toEqual([
      ['Recording the uploaded photo on the repair failed:', 'Unable to save the photo reference: the repair was not changed'],
    ])
    // The upload itself is still recorded in the cache, as before.
    expect(getSession()).toMatchObject({ mediaPaths: ['user-1/row/photo.jpg'], imagePath: 'user-1/row/photo.jpg' })
  })

  it('a good upload with a row records the path and logs nothing', async () => {
    saveSession({ diagnosisPersistence: { userId: USER_ID, repairSessionId: ROW_ID } })
    upload.mockResolvedValueOnce('user-1/row/photo.jpg')
    recordPath.mockResolvedValueOnce(undefined)
    await persistCaptureMedia(photo(), USER_ID)

    expect(upload).toHaveBeenCalledWith(expect.any(Blob), ROW_ID)
    expect(recordPath).toHaveBeenCalledWith(ROW_ID, 'user-1/row/photo.jpg')
    expect(warn).not.toHaveBeenCalled()
  })

  it('before the row exists, the upload is scoped to the attempt and no path update runs', async () => {
    upload.mockResolvedValueOnce('user-1/attempt-1/photo.jpg')
    await persistCaptureMedia(photo(), USER_ID)

    expect(upload).toHaveBeenCalledWith(expect.any(Blob), 'attempt-1')
    expect(recordPath).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(getSession()?.mediaPaths).toEqual(['user-1/attempt-1/photo.jpg'])
  })
})
