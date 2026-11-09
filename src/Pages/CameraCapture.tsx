import { motion } from 'framer-motion'
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  ImagePlus,
  Loader2,
  LogIn,
  Mic,
  SwitchCamera,
  Upload,
} from 'lucide-react'
import PageShell from '../components/PageShell'
import { useAuth } from '../components/authContext'
import AROverlay from '../components/AROverlay'
import VoiceInput from '../components/VoiceInput'
import SafetyBubble from '../components/SafetyBubble'
import { analyzeImage } from '../services/visionAI'
import { AnalysisError } from '../types/analysis'
import {
  clearSession,
  getSession,
  isValidDiagnosisResult,
  saveSession,
  setDiagnosis,
} from '../services/repairSession'
import { uploadPrivateRepairMediaBlob } from '../services/mediaService'
import { persistImagePath } from '../services/repairSessionDb'
import { savePhoto } from '../services/localPhotoStore'
import { getLocale, subscribeLocale, t } from '../i18n'
import {
  analysisErrorMessageKey,
  canRetryAnalysis,
  describeAnalysisFailure,
  type AnalysisFailure,
} from '../utils/analysisError'
import { clearCaptureDraft, loadCaptureDraft, saveCaptureDraft } from '../utils/captureDraft'
import {
  IMAGE_PROBLEM_KEYS,
  JPEG_QUALITY,
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGE_SIDE,
  MAX_OUTPUT_BYTES,
  fitWithin,
  validateDescription,
  validateImageFile,
} from '../utils/captureValidation'
import { ImageProcessingError, processImageFile } from '../utils/imageProcessing'
import { createRequestGuard } from '../utils/requestGuard'
import type { FixtureOutcome } from '../dev/analysisFixtures'
import { fixturesFlagEnabled, isDevBuild } from '../config/env'
import { FixturePanel, loadAnalysisFixtures } from '../config/devFixtures'
import { SLOW_REQUEST_MS } from '../config/limits'

type CameraState = 'loading' | 'ready' | 'error'
type VoiceState = 'idle' | 'listening' | 'error'
type RequestState = 'idle' | 'validating' | 'submitting' | 'success' | 'error'
type PhotoSource = 'camera' | 'upload'
type Photo = { blob: Blob; dataUrl: string }
type FailureView = AnalysisFailure & { retryAt: number | undefined }

// DEV-ONLY test hook. FixturePanel and loadAnalysisFixtures come from config/devFixtures.ts, which
// is removed from production builds together with the fixture modules.
function readFixtureParams(): { name: string; delaySeconds: number } | null {
  if (!isDevBuild) return null
  if (!fixturesFlagEnabled) return null
  const params = new URLSearchParams(window.location.search)
  const name = params.get('fixture')
  if (!name) return null
  const delay = Number(params.get('delay') ?? '0')
  return { name, delaySeconds: Number.isFinite(delay) ? delay : 0 }
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

function createImageBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Unable to create an image from the photo.'))
    }, 'image/jpeg', JPEG_QUALITY)
  })
}

export default function CameraCapture() {
  const navigate = useNavigate()
  const { user, loading, error } = useAuth()
  useSyncExternalStore(subscribeLocale, getLocale)

  // Session restore in progress: show a skeleton. Do not redirect or flash a login screen.
  if (loading) {
    return (
      <PageShell className="flex min-h-screen items-center justify-center p-6">
        <div role="status" aria-live="polite" className="glass-panel w-full max-w-sm animate-pulse rounded-2xl p-6">
          <div className="mb-4 h-5 w-2/3 rounded bg-surface-high" />
          <div className="mb-3 h-3 w-full rounded bg-surface-high" />
          <div className="h-3 w-3/4 rounded bg-surface-high" />
          <span className="sr-only">{t('capture.authChecking')}</span>
        </div>
      </PageShell>
    )
  }

  // Auth finished and nobody is signed in: explain, and let the user choose to log in.
  if (!user || error) {
    return (
      <PageShell className="flex min-h-screen items-center justify-center p-6">
        <div role="alert" className="glass-panel w-full max-w-md rounded-2xl p-6 text-center">
          <LogIn className="mx-auto mb-3 h-8 w-8 text-primary" aria-hidden="true" />
          <h1 className="text-heading-md">{t('capture.loginRequired')}</h1>
          <button
            type="button"
            onClick={() => navigate('/login', { state: { from: { pathname: '/capture' } } })}
            className="mt-5 min-h-11 rounded-xl bg-primary px-6 py-3 font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t('capture.loginAction')}
          </button>
        </div>
      </PageShell>
    )
  }

  return <CaptureForm userId={user.id} />
}

function CaptureForm({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  useSyncExternalStore(subscribeLocale, getLocale)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const errorPanelRef = useRef<HTMLDivElement>(null)
  const lastSource = useRef<PhotoSource>('upload')
  const submitLock = useRef(false)
  const [guard] = useState(createRequestGuard)
  const [fixtureParams] = useState(readFixtureParams)

  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [cameraState, setCameraState] = useState<CameraState>('loading')
  const [cameraErrorKey, setCameraErrorKey] = useState('')
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [retryCount, setRetryCount] = useState(0)
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null)
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [photoErrorKey, setPhotoErrorKey] = useState('')
  const [description, setDescription] = useState(() => loadCaptureDraft(userId))
  const [descriptionTouched, setDescriptionTouched] = useState(false)
  const [requestState, setRequestState] = useState<RequestState>('idle')
  const [slow, setSlow] = useState(false)
  const [failure, setFailure] = useState<FailureView | null>(null)
  const [now, setNow] = useState(0)
  const [fixtureResult, setFixtureResult] = useState<FixtureOutcome | null>(null)
  const [unsafeWarningKey, setUnsafeWarningKey] = useState('')
  const [showSafety, setShowSafety] = useState(false)
  const [voiceSupported] = useState(
    () =>
      typeof window !== 'undefined' &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  )
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [voiceErrorKey, setVoiceErrorKey] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')

  const busy = requestState === 'validating' || requestState === 'submitting'
  const cameraActive = cameraEnabled && !photo
  const descriptionProblem = validateDescription(description)
  const descriptionValid = descriptionProblem === null
  const descriptionValidation =
    descriptionProblem === 'too_short'
      ? t('capture.descriptionTooShort')
      : descriptionProblem === 'too_long'
        ? t('capture.descriptionTooLong')
        : ''

  useEffect(() => {
    clearSession()
  }, [])

  // A response that arrives after the user left the page must do nothing.
  useEffect(() => () => guard.invalidate(), [guard])

  // Save only the description (never the photo), shortly after typing stops.
  useEffect(() => {
    const timer = window.setTimeout(() => saveCaptureDraft(userId, description), 400)
    return () => window.clearTimeout(timer)
  }, [userId, description])

  // Calm "still working" line after a long wait. No countdown is invented.
  useEffect(() => {
    if (requestState !== 'submitting') return
    const timer = window.setTimeout(() => setSlow(true), SLOW_REQUEST_MS)
    return () => {
      window.clearTimeout(timer)
      setSlow(false)
    }
  }, [requestState])

  // Move focus to the error panel whenever a new failure is shown.
  useEffect(() => {
    if (failure) errorPanelRef.current?.focus()
  }, [failure])

  // Tick only while a trusted retry-after time is still in the future.
  useEffect(() => {
    const retryAt = failure?.retryAt
    if (retryAt === undefined) return
    const id = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= retryAt) window.clearInterval(id)
    }, 1000)
    return () => window.clearInterval(id)
  }, [failure])

  const stopCamera = useCallback(() => {
    stopTracks(streamRef.current)
    streamRef.current = null
    setStream(null)
    setCameraState('loading')
    setVideoSize(null)
    setUnsafeWarningKey('')
  }, [])

  // Release the camera whenever the page is hidden (tab switch, app switch, screen off).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopCamera()
        setCameraEnabled(false)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [stopCamera])

  const startCamera = useCallback(async (cancelled: () => boolean) => {
    setCameraState('loading')
    setCameraErrorKey('')
    setVideoSize(null)
    const currentStream = streamRef.current
    if (currentStream) {
      stopTracks(currentStream)
      streamRef.current = null
    }
    setStream(null)

    if (!window.isSecureContext) {
      setCameraErrorKey('capture.cameraSecureContext')
      setCameraState('error')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraErrorKey('capture.cameraUnsupported')
      setCameraState('error')
      return
    }

    let acquiredStream: MediaStream
    try {
      try {
        acquiredStream = await navigator.mediaDevices.getUserMedia({
          // Without a resolution request browsers default to 640x480, which made the
          // saved photo look blurry in the guide. `ideal` is a hint, never an error.
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
      } catch (error) {
        const name = error instanceof Error ? error.name : ''
        if (name !== 'OverconstrainedError' && name !== 'NotFoundError') throw error
        acquiredStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        })
      }
    } catch (error) {
      console.error('Unable to start the camera:', error instanceof Error ? error.name : 'unknown')
      if (cancelled()) return
      const name = error instanceof Error ? error.name : ''
      const errorKey =
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'capture.cameraPermissionDenied'
          : name === 'NotFoundError' || name === 'DevicesNotFoundError'
            ? 'capture.cameraNotFound'
            : name === 'NotReadableError' || name === 'TrackStartError'
              ? 'capture.cameraInUse'
              : name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError'
                ? 'capture.cameraConstraints'
                : name === 'SecurityError'
                  ? 'capture.cameraSecurityError'
                  : 'capture.cameraUnknownError'
      setCameraErrorKey(errorKey)
      setCameraState('error')
      return
    }

    // A stream that arrives after the effect was cleaned up (StrictMode, fast unmount,
    // or the camera being switched off) must be stopped, never kept running.
    if (cancelled()) {
      stopTracks(acquiredStream)
      return
    }
    streamRef.current = acquiredStream
    setStream(acquiredStream)
  }, [facingMode])

  useEffect(() => {
    if (!cameraActive) return
    let active = true
    const timer = window.setTimeout(() => {
      void startCamera(() => !active)
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
      const activeStream = streamRef.current
      if (activeStream) {
        stopTracks(activeStream)
        streamRef.current = null
      }
    }
  }, [cameraActive, retryCount, startCamera])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!stream) {
      video.srcObject = null
      return
    }
    video.srcObject = stream
    void video.play().catch((error: unknown) => {
      console.error('Unable to play the camera preview:', error instanceof Error ? error.name : 'unknown')
      setCameraErrorKey('capture.cameraPlaybackError')
      setCameraState('error')
    })
    return () => {
      if (video.srcObject === stream) video.srcObject = null
    }
  }, [stream])

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (cameraState !== 'ready' || !cameraActive || !video || !canvas) return
    const timer = window.setInterval(() => {
      if (!video.videoWidth || !video.videoHeight) return
      const context = canvas.getContext('2d')
      if (!context) return
      canvas.width = 32
      canvas.height = 32
      context.drawImage(video, 0, 0, 32, 32)
      const pixels = context.getImageData(0, 0, 32, 32).data
      let brightness = 0
      for (let index = 0; index < pixels.length; index += 4) {
        brightness += (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3
      }
      brightness /= pixels.length / 4
      setUnsafeWarningKey(brightness < 40 ? 'capture.unsafeLighting' : '')
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cameraState, cameraActive])

  useEffect(() => () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
  }, [])

  const chooseCamera = () => {
    setPhotoErrorKey('')
    setCameraEnabled(true)
  }

  const chooseUpload = () => {
    // Switching to upload releases the camera right away.
    stopCamera()
    setCameraEnabled(false)
    fileInputRef.current?.click()
  }

  const acceptPhoto = (next: Photo, source: PhotoSource) => {
    lastSource.current = source
    stopCamera()
    if (source === 'upload') setCameraEnabled(false)
    setPhoto(next)
    setPhotoErrorKey('')
    setFailure(null)
    setFixtureResult(null)
    setRequestState('idle')
    setDescriptionTouched(false)
  }

  const capture = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || cameraState !== 'ready' || busy) return
    if (unsafeWarningKey) {
      setShowSafety(true)
      return
    }
    const dimensions = fitWithin(video.videoWidth, video.videoHeight, MAX_IMAGE_SIDE)
    if (!video.videoWidth || !video.videoHeight) return
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    const context = canvas.getContext('2d')
    if (!context) return
    // Canvas resampling defaults to low quality; ask for the best when resizing the frame.
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(video, 0, 0, dimensions.width, dimensions.height)
    try {
      const blob = await createImageBlob(canvas)
      if (blob.size > MAX_OUTPUT_BYTES) throw new ImageProcessingError('too_large')
      acceptPhoto({ blob, dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY) }, 'camera')
    } catch (error) {
      console.error(
        'Unable to process the captured photo:',
        error instanceof ImageProcessingError ? error.problem : 'unknown'
      )
      setPhotoErrorKey(
        error instanceof ImageProcessingError
          ? IMAGE_PROBLEM_KEYS[error.problem]
          : 'capture.photoProcessingError'
      )
    }
  }

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return

    const problem = validateImageFile(file)
    if (problem) {
      setPhotoErrorKey(IMAGE_PROBLEM_KEYS[problem])
      return
    }

    setPhotoErrorKey('')
    setRequestState('validating')
    const token = guard.next()
    try {
      const processed = await processImageFile(file)
      if (!guard.isCurrent(token)) return
      acceptPhoto(processed, 'upload')
    } catch (error) {
      if (!guard.isCurrent(token)) return
      console.error(
        'Unable to process the uploaded photo:',
        error instanceof ImageProcessingError ? error.problem : 'unknown'
      )
      setPhotoErrorKey(
        error instanceof ImageProcessingError
          ? IMAGE_PROBLEM_KEYS[error.problem]
          : 'capture.photoProcessingError'
      )
      setRequestState('idle')
    }
  }

  // S09: upload the just-captured photo to the private bucket and record its
  // object path on the active session, so it is associated with the repair and
  // can be scrubbed on deletion. Never throws into the analyze flow.
  const persistCaptureMedia = async (blob: Blob) => {
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
    try {
      const sessionScope = session?.diagnosisPersistence?.repairSessionId ?? session?.diagnosisAttemptId
      if (!sessionScope) return
      const path = await uploadPrivateRepairMediaBlob(blob, sessionScope)
      const current = getSession()
      const mediaPaths = [...new Set([...(current?.mediaPaths ?? []), path])]
      saveSession({ mediaPaths, imagePath: current?.imagePath ?? path })
      // If the repair row already exists, record the photo on it now so it survives a new
      // tab or a resume. If it does not exist yet, the Diagnosis page writes it with the row.
      const repairSessionId = getSession()?.diagnosisPersistence?.repairSessionId
      if (repairSessionId) await persistImagePath(repairSessionId, current?.imagePath ?? path)
    } catch (error) {
      console.warn('Private media upload failed:', error instanceof Error ? error.message : 'unknown')
    }
  }

  const analyze = async () => {
    setDescriptionTouched(true)
    // The ref blocks a second call made before state has updated.
    if (!photo || !descriptionValid || submitLock.current) return
    submitLock.current = true
    const token = guard.next()
    setRequestState('submitting')
    try {
      if (navigator.onLine === false) throw new AnalysisError('service_unavailable', true)

      // DEV-ONLY: when every fixture gate passed, never reach the real service.
      if (loadAnalysisFixtures && fixtureParams !== null) {
        const { runFixture } = await loadAnalysisFixtures()
        const outcome = await runFixture(fixtureParams.name, fixtureParams.delaySeconds)
        if (!guard.isCurrent(token)) return
        setFixtureResult(outcome)
        setFailure(null)
        setRequestState('success')
        return
      }

      const diagnosis = await analyzeImage(photo.blob, description.trim())
      if (!guard.isCurrent(token)) return
      if (!isValidDiagnosisResult(diagnosis)) throw new AnalysisError('invalid_response', true)

      setDiagnosis(diagnosis, photo.dataUrl, description.trim(), userId)
      // S09: persist the captured photo to the PRIVATE bucket, scoped to this
      // attempt. Best-effort: a storage hiccup must never block the diagnosis
      // the user just got, so failures are logged (no raw image) and ignored.
      void persistCaptureMedia(photo.blob)
      clearCaptureDraft()
      setFailure(null)
      setRequestState('success')
      navigate('/diagnosis')
    } catch (error) {
      if (!guard.isCurrent(token)) return
      const described = describeAnalysisFailure(error)
      // Log only the kind and code: never the photo, description, token or message text.
      console.error('Image analysis failed:', { kind: described.kind, code: described.code })
      const current = Date.now()
      setNow(current)
      setFailure({
        ...described,
        retryAt:
          described.retryAfterSeconds !== undefined
            ? current + described.retryAfterSeconds * 1000
            : undefined,
      })
      setRequestState('error')
    } finally {
      submitLock.current = false
    }
  }

  const retakePhoto = () => {
    // The description is kept. If the photo came from the camera, the preview restarts.
    setPhoto(null)
    setPhotoErrorKey('')
    setFailure(null)
    setFixtureResult(null)
    setRequestState('idle')
    if (lastSource.current === 'camera') setCameraEnabled(true)
  }

  const logInAgain = async () => {
    try {
      await signOut()
    } catch {
      // Continue to the login page even if the session could not be cleared.
    }
    clearCaptureDraft()
    navigate('/login', { state: { from: { pathname: '/capture' } } })
  }

  const handleVoiceCommand = (text: string) => {
    if (text.includes('photo') || text.includes('capture') || text.includes('scan')) {
      void capture()
    }
  }

  const toggleVoiceInput = () => {
    if (voiceState === 'listening') {
      recognitionRef.current?.stop()
      return
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) return
    const recognition = new Recognition()
    recognitionRef.current = recognition
    recognition.lang = getLocale() === 'hi' ? 'hi-IN' : 'en-IN'
    recognition.continuous = true
    recognition.interimResults = true
    setVoiceErrorKey('')
    setInterimTranscript('')
    setVoiceState('listening')
    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) finalText += transcript
        else interimText += transcript
      }
      if (finalText.trim()) {
        const finalTranscript = finalText.trim()
        setDescription((current) =>
          current.trim()
            ? `${current.trimEnd()} ${finalTranscript}`
            : finalTranscript
        )
        setDescriptionTouched(true)
      }
      setInterimTranscript(interimText)
    }
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorKey =
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'capture.voicePermissionError'
          : event.error === 'no-speech'
            ? 'capture.voiceNoSpeechError'
            : 'capture.voiceNetworkError'
      setVoiceErrorKey(errorKey)
      setVoiceState('error')
      setInterimTranscript('')
    }
    recognition.onend = () => {
      setVoiceState((current) => current === 'listening' ? 'idle' : current)
      setInterimTranscript('')
      recognitionRef.current = null
    }
    try {
      recognition.start()
    } catch (error) {
      console.error('Unable to start voice input:', error instanceof Error ? error.name : 'unknown')
      setVoiceErrorKey('capture.voiceNetworkError')
      setVoiceState('error')
      recognitionRef.current = null
    }
  }

  const retryRemaining =
    failure?.retryAt !== undefined ? Math.max(0, Math.ceil((failure.retryAt - now) / 1000)) : 0
  const showChooser = !photo && !cameraEnabled

  return (
    <PageShell className="relative flex min-h-screen flex-col">
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void handleFileUpload(event)}
      />

      <header className="relative z-20 flex items-center justify-between p-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="glass-panel rounded-full p-2 focus-visible:outline-2 focus-visible:outline-primary"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {cameraState === 'ready' && cameraActive && videoSize && (
          <span className="glass-panel rounded-lg px-3 py-1 text-xs text-text-secondary">
            {videoSize.w}x{videoSize.h}
          </span>
        )}
        <VoiceInput onCommand={handleVoiceCommand} />
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-6">
        {FixturePanel && fixtureParams && (
          <Suspense fallback={null}>
            <FixturePanel name={fixtureParams.name} outcome={fixtureResult} />
          </Suspense>
        )}

        <section className="relative min-h-[38vh] flex-1 overflow-hidden rounded-2xl bg-black sm:min-h-[48vh]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={(event) => {
              setVideoSize({
                w: event.currentTarget.videoWidth,
                h: event.currentTarget.videoHeight,
              })
              setCameraState('ready')
            }}
            onPlaying={() => setCameraState('ready')}
            className={`absolute inset-0 h-full w-full object-cover ${photo || !cameraActive || cameraState !== 'ready' ? 'invisible' : ''}`}
            style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : undefined }}
          />
          {photo ? (
            <img
              src={photo.dataUrl}
              alt={t('capture.photoPreviewAlt')}
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : showChooser ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-5 text-center">
              <p className="text-sm text-text-secondary">{t('capture.chooseSource')}</p>
              <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={chooseCamera}
                  disabled={busy}
                  className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <Camera className="h-5 w-5" aria-hidden="true" />
                  {t('capture.useCamera')}
                </button>
                <button
                  type="button"
                  onClick={chooseUpload}
                  disabled={busy}
                  className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-primary px-4 py-3 font-semibold text-primary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {requestState === 'validating' ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="h-5 w-5" aria-hidden="true" />
                  )}
                  {t('capture.uploadFromDevice')}
                </button>
              </div>
              {photoErrorKey && (
                <p role="alert" className="flex items-start gap-2 text-sm text-error">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{t(photoErrorKey)}</span>
                </p>
              )}
            </div>
          ) : cameraState === 'ready' ? (
            <>
              <AROverlay />
              <p className="absolute bottom-4 left-0 right-0 z-10 px-4 text-center text-sm text-white drop-shadow-lg">
                {t('capture.instruction')}
              </p>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center">
              {cameraState === 'loading' && <Loader2 className="h-9 w-9 animate-spin text-primary" aria-label={t('common.loading')} />}
              {cameraState === 'error' && (
                <>
                  <p role="alert" className="max-w-md text-sm text-text-secondary">
                    {t(cameraErrorKey)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRetryCount((count) => count + 1)}
                    className="min-h-11 rounded-xl border border-primary px-5 py-2.5 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {t('capture.permissionRetry')}
                  </button>
                </>
              )}
            </div>
          )}
          {unsafeWarningKey && !photo && cameraState === 'ready' && cameraActive && (
            <p role="status" className="absolute left-3 right-3 top-3 z-20 rounded-lg bg-background/85 p-2 text-center text-sm text-warning">
              {t(unsafeWarningKey)}
            </p>
          )}
        </section>

        {!photo && cameraEnabled && (
          <section className="glass-panel rounded-2xl p-4">
            <p className="mb-4 text-center text-sm text-text-secondary">{t('capture.title')}</p>
            <div className="flex items-center justify-center gap-5">
              <button
                type="button"
                onClick={() => setFacingMode((mode) => mode === 'environment' ? 'user' : 'environment')}
                className="glass-panel rounded-full p-3 focus-visible:outline-2 focus-visible:outline-primary"
                aria-label={t('capture.flip')}
              >
                <SwitchCamera className="h-6 w-6 text-text-secondary" />
              </button>
              <button
                type="button"
                onClick={() => void capture()}
                disabled={cameraState !== 'ready' || busy}
                className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-primary bg-primary/20 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
                aria-label={t('capture.capture')}
              >
                <Camera className="h-8 w-8 text-primary" />
              </button>
              <button
                type="button"
                onClick={chooseUpload}
                disabled={busy}
                className="glass-panel rounded-full p-3 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
                aria-label={t('capture.uploadPhoto')}
              >
                <Upload className="h-6 w-6 text-text-secondary" />
              </button>
            </div>
            <button
              type="button"
              onClick={chooseUpload}
              disabled={busy}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white"
              aria-label={t('capture.uploadPhoto')}
            >
              <ImagePlus className="h-5 w-5" />
              {t('capture.uploadPhoto')}
            </button>
            {photoErrorKey && (
              <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-error">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t(photoErrorKey)}</span>
              </p>
            )}
          </section>
        )}

        {photo && (
          <section className="glass-panel space-y-4 rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-heading-md">{t('capture.describeProblem')}</h1>
              <button
                type="button"
                onClick={retakePhoto}
                disabled={busy}
                className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
              >
                {t('capture.retakePhoto')}
              </button>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="min-h-11 w-full rounded-xl border border-primary px-4 py-2.5 text-sm font-semibold text-primary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={t('capture.chooseAnotherPhoto')}
            >
              {t('capture.chooseAnotherPhoto')}
            </button>
            {photoErrorKey && (
              <p role="alert" className="flex items-start gap-2 text-sm text-error">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t(photoErrorKey)}</span>
              </p>
            )}
            <label htmlFor="problem-description" className="block text-sm font-medium">
              {t('capture.descriptionLabel')}
            </label>
            <div className="relative">
              <textarea
                id="problem-description"
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value)
                  setDescriptionTouched(true)
                }}
                onBlur={() => setDescriptionTouched(true)}
                rows={4}
                maxLength={MAX_DESCRIPTION_LENGTH}
                required
                placeholder={t('capture.descriptionPlaceholder')}
                aria-describedby="description-counter description-validation"
                aria-invalid={descriptionTouched && !descriptionValid}
                className="w-full resize-y rounded-xl border border-border bg-background p-3 pr-14 text-text-primary placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-primary"
              />
              {voiceSupported && (
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`absolute right-3 top-3 rounded-full p-2 transition focus-visible:outline-2 focus-visible:outline-primary ${voiceState === 'listening' ? 'animate-pulse ring-2 ring-teal-400' : ''}`}
                  aria-label={voiceState === 'listening' ? t('capture.stopListening') : t('capture.startListening')}
                >
                  <Mic className="h-5 w-5 text-primary" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <p id="description-validation" role={descriptionTouched && !descriptionValid ? 'alert' : undefined} className={descriptionTouched && !descriptionValid ? 'text-error' : 'text-text-subtle'}>
                {descriptionValidation}
              </p>
              <p id="description-counter" className="text-text-subtle">
                {t('capture.characterCount')}: {description.length}/{MAX_DESCRIPTION_LENGTH}
              </p>
            </div>
            {voiceSupported ? (
              <div aria-live="polite" className="text-sm text-text-secondary">
                {voiceState === 'listening' && (
                  <p className="animate-pulse text-primary">{t('capture.listening')}</p>
                )}
                {interimTranscript && <p>{interimTranscript}</p>}
                {voiceState === 'error' && voiceErrorKey && <p role="alert" className="text-error">{t(voiceErrorKey)}</p>}
              </div>
            ) : (
              <p className="text-xs text-text-subtle">{t('capture.voiceUnsupported')}</p>
            )}

            <p role="status" aria-live="polite" className="sr-only">
              {requestState === 'validating'
                ? t('capture.processingPhoto')
                : requestState === 'submitting'
                  ? t('capture.analyzing')
                  : ''}
            </p>
            {slow && (
              <p aria-live="polite" className="text-sm text-text-secondary">
                {t('capture.analysisSlow')}
              </p>
            )}

            {failure && (
              <div
                ref={errorPanelRef}
                role="alert"
                tabIndex={-1}
                aria-busy={requestState === 'submitting'}
                className="glass-panel rounded-xl border border-warning/40 p-4 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                  <div className="min-w-0">
                    <h2 className="font-semibold text-text-primary">{t('capture.analysisErrorTitle')}</h2>
                    <p className="mt-1 text-sm text-text-secondary">{t(analysisErrorMessageKey(failure))}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {failure.kind === 'unauthenticated' ? (
                    <button
                      type="button"
                      onClick={() => void logInAgain()}
                      className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {t('capture.loginAction')}
                    </button>
                  ) : (
                    canRetryAnalysis(failure) && (
                      <button
                        type="button"
                        onClick={() => void analyze()}
                        disabled={busy || retryRemaining > 0}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {requestState === 'submitting' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        {retryRemaining > 0
                          ? t('capture.analysisTryAgainIn').replace('{seconds}', String(retryRemaining))
                          : t('capture.analysisTryAgain')}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={retakePhoto}
                    disabled={busy}
                    className="min-h-11 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-text-secondary hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {t('capture.analysisChangePhoto')}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="min-h-11 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-text-secondary hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {t('capture.analysisBackHome')}
                  </button>
                </div>
              </div>
            )}

            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => void analyze()}
              disabled={!photo || !descriptionValid || busy}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white"
              aria-label={requestState === 'submitting' ? t('capture.analyzing') : t('capture.analyze')}
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
              {requestState === 'submitting' ? t('capture.analyzing') : t('capture.analyze')}
            </motion.button>
          </section>
        )}
      </div>

      <SafetyBubble
        open={showSafety}
        message={unsafeWarningKey ? t(unsafeWarningKey) : ''}
        onConfirm={() => {
          setShowSafety(false)
          setUnsafeWarningKey('')
          void capture()
        }}
        onCancel={() => setShowSafety(false)}
      />
    </PageShell>
  )
}
