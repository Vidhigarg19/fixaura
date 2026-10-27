import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  ImagePlus,
  Loader2,
  Mic,
  SwitchCamera,
  Upload,
} from 'lucide-react'
import PageShell from '../components/PageShell'
import Navbar from '../components/Navbar'
import AROverlay from '../components/AROverlay'
import VoiceInput from '../components/VoiceInput'
import SafetyBubble from '../components/SafetyBubble'
import { analyzeImage } from '../services/visionAI'
import { setDiagnosis } from '../services/repairSession'
import { getLocale, subscribeLocale, t } from '../i18n'

type CameraState = 'loading' | 'ready' | 'error'
type VoiceState = 'idle' | 'listening' | 'error'

const MAX_IMAGE_SIDE = 1280
const MAX_DESCRIPTION_LENGTH = 500
const MIN_DESCRIPTION_LENGTH = 10

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

function createImageBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Unable to create an image from the photo.'))
    }, 'image/jpeg', 0.85)
  })
}

function imageDimensions(width: number, height: number) {
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height))
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

export default function CameraCapture() {
  const navigate = useNavigate()
  useSyncExternalStore(subscribeLocale, getLocale)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraState, setCameraState] = useState<CameraState>('loading')
  const [cameraErrorKey, setCameraErrorKey] = useState('')
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [retryCount, setRetryCount] = useState(0)
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null)
  const [photo, setPhoto] = useState<{ blob: Blob; dataUrl: string } | null>(null)
  const [description, setDescription] = useState('')
  const [descriptionTouched, setDescriptionTouched] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisErrorKey, setAnalysisErrorKey] = useState('')
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

  const descriptionLength = description.trim().length
  const descriptionValid =
    descriptionLength >= MIN_DESCRIPTION_LENGTH &&
    description.length <= MAX_DESCRIPTION_LENGTH
  const descriptionValidation = descriptionLength < MIN_DESCRIPTION_LENGTH
    ? t('capture.descriptionTooShort')
    : description.length > MAX_DESCRIPTION_LENGTH
      ? t('capture.descriptionTooLong')
      : ''

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
          video: { facingMode: { ideal: facingMode } },
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
      console.error('Unable to start the camera:', error)
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

    if (cancelled()) {
      stopTracks(acquiredStream)
      return
    }
    streamRef.current = acquiredStream
    setStream(acquiredStream)
  }, [facingMode])

  useEffect(() => {
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
  }, [retryCount, startCamera])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!stream) {
      video.srcObject = null
      return
    }
    video.srcObject = stream
    void video.play().catch((error: unknown) => {
      console.error('Unable to play the camera preview:', error)
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
    if (cameraState !== 'ready' || !video || !canvas) return
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
  }, [cameraState])

  useEffect(() => () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
  }, [])

  const savePhoto = async (canvas: HTMLCanvasElement) => {
    const blob = await createImageBlob(canvas)
    setPhoto({ blob, dataUrl: canvas.toDataURL('image/jpeg', 0.85) })
    setAnalysisErrorKey('')
    setDescriptionTouched(false)
  }

  const capture = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || cameraState !== 'ready' || analyzing) return
    if (unsafeWarningKey) {
      setShowSafety(true)
      return
    }
    const dimensions = imageDimensions(video.videoWidth, video.videoHeight)
    if (!dimensions.width || !dimensions.height) return
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, dimensions.width, dimensions.height)
    try {
      await savePhoto(canvas)
    } catch (error) {
      console.error('Unable to process the captured photo:', error)
      setAnalysisErrorKey('capture.photoProcessingError')
    }
  }

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || analyzing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Unable to load uploaded image.'))
        image.src = url
      })
      const dimensions = imageDimensions(image.naturalWidth, image.naturalHeight)
      canvas.width = dimensions.width
      canvas.height = dimensions.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas rendering is unavailable.')
      context.drawImage(image, 0, 0, dimensions.width, dimensions.height)
      await savePhoto(canvas)
    } catch (error) {
      console.error('Unable to process the uploaded photo:', error)
      setAnalysisErrorKey('capture.photoProcessingError')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const analyze = async () => {
    setDescriptionTouched(true)
    if (!photo || !descriptionValid || analyzing) return
    setAnalyzing(true)
    setAnalysisErrorKey('')
    try {
      const diagnosis = await analyzeImage(photo.blob, description.trim())
      setDiagnosis(diagnosis, photo.dataUrl, description.trim())
      navigate('/diagnosis')
    } catch (error) {
      console.error('Image analysis failed:', error)
      setAnalysisErrorKey('capture.analysisError')
    } finally {
      setAnalyzing(false)
    }
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
      console.error('Unable to start voice input:', error)
      setVoiceErrorKey('capture.voiceNetworkError')
      setVoiceState('error')
      recognitionRef.current = null
    }
  }

  const clearPhoto = () => {
    setPhoto(null)
    setDescription('')
    setDescriptionTouched(false)
    setAnalysisErrorKey('')
  }

  return (
    <PageShell className="relative flex min-h-screen flex-col">
      <Navbar />
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
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
        {cameraState === 'ready' && videoSize && !photo && (
          <span className="glass-panel rounded-lg px-3 py-1 text-xs text-text-secondary">
            {videoSize.w}x{videoSize.h}
          </span>
        )}
        <VoiceInput onCommand={handleVoiceCommand} />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-6">
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
            className={`absolute inset-0 h-full w-full object-cover ${photo || cameraState !== 'ready' ? 'invisible' : ''}`}
            style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : undefined }}
          />
          {photo ? (
            <img
              src={photo.dataUrl}
              alt={t('capture.photoPreviewAlt')}
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : cameraState === 'ready' ? (
            <>
              <AROverlay variant="capture" />
              <p className="absolute bottom-4 left-0 right-0 z-10 px-4 text-center text-sm text-white drop-shadow-lg">
                {t('capture.instruction')}
              </p>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center">
              {cameraState === 'loading' && <Loader2 className="h-9 w-9 animate-spin text-primary" />}
              {cameraState === 'error' && (
                <>
                  <p role="alert" className="max-w-md text-sm text-text-secondary">
                    {t(cameraErrorKey)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRetryCount((count) => count + 1)}
                    className="rounded-xl border border-primary px-5 py-2.5 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {t('capture.permissionRetry')}
                  </button>
                </>
              )}
            </div>
          )}
          {unsafeWarningKey && !photo && cameraState === 'ready' && (
            <p role="status" className="absolute left-3 right-3 top-3 z-20 rounded-lg bg-background/85 p-2 text-center text-sm text-warning">
              {t(unsafeWarningKey)}
            </p>
          )}
        </section>

        {!photo ? (
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
                disabled={cameraState !== 'ready' || analyzing}
                className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-primary bg-primary/20 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
                aria-label={t('capture.capture')}
              >
                <Camera className="h-8 w-8 text-primary" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={analyzing}
                className="glass-panel rounded-full p-3 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
                aria-label={t('capture.uploadPhoto')}
              >
                <Upload className="h-6 w-6 text-text-secondary" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={analyzing}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white"
              aria-label={t('capture.uploadPhoto')}
            >
              <ImagePlus className="h-5 w-5" />
              {t('capture.uploadPhoto')}
            </button>
          </section>
        ) : (
          <section className="glass-panel space-y-4 rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-heading-md">{t('capture.describeProblem')}</h1>
              <button
                type="button"
                onClick={clearPhoto}
                className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary focus-visible:outline-2 focus-visible:outline-primary"
              >
                {t('capture.retakePhoto')}
              </button>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border border-primary px-4 py-2.5 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={t('capture.chooseAnotherPhoto')}
            >
              {t('capture.chooseAnotherPhoto')}
            </button>
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
                minLength={MIN_DESCRIPTION_LENGTH}
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
            {analysisErrorKey && <p role="alert" className="text-sm text-error">{t(analysisErrorKey)}</p>}
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => void analyze()}
              disabled={!photo || !descriptionValid || analyzing}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white"
              aria-label={t('capture.analyze')}
            >
              {analyzing && <Loader2 className="h-5 w-5 animate-spin" />}
              {analyzing ? t('capture.analyzing') : t('capture.analyze')}
            </motion.button>
          </section>
        )}
      </main>

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
