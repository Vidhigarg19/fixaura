import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Camera, ImagePlus, Loader2, RotateCcw, SwitchCamera, Upload } from 'lucide-react'
import { getLocale, subscribeLocale, t } from '../i18n'
import {
  createPhotoFromCanvas,
  createPhotoFromFile,
  imageDimensions,
  stopMediaTracks,
  type CapturedPhoto,
} from '../services/photoImage'

type CameraState = 'loading' | 'ready' | 'error'

interface PhotoCaptureProps {
  photo: CapturedPhoto | null
  onChange: (photo: CapturedPhoto | null) => void
}

export default function PhotoCapture({ photo, onChange }: PhotoCaptureProps) {
  useSyncExternalStore(subscribeLocale, getLocale)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraState, setCameraState] = useState<CameraState>('loading')
  const [cameraError, setCameraError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [retryCount, setRetryCount] = useState(0)

  const startCamera = useCallback(async (cancelled: () => boolean) => {
    setCameraState('loading')
    setCameraError('')
    const currentStream = streamRef.current
    if (currentStream) stopMediaTracks(currentStream)
    streamRef.current = null
    setStream(null)

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('capture.cameraSecureContext')
      setCameraState('error')
      return
    }

    try {
      const acquiredStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      })
      if (cancelled()) {
        stopMediaTracks(acquiredStream)
        return
      }
      streamRef.current = acquiredStream
      setStream(acquiredStream)
    } catch (error) {
      console.error('Unable to start the verification camera:', error)
      if (cancelled()) return
      const name = error instanceof Error ? error.name : ''
      setCameraError(name === 'NotAllowedError' ? 'capture.cameraPermissionDenied' : 'capture.cameraUnknownError')
      setCameraState('error')
    }
  }, [facingMode])

  useEffect(() => {
    if (photo) {
      const activeStream = streamRef.current
      if (activeStream) stopMediaTracks(activeStream)
      streamRef.current = null
      return
    }
    let active = true
    const timer = window.setTimeout(() => {
      void startCamera(() => !active)
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
      const activeStream = streamRef.current
      if (activeStream) stopMediaTracks(activeStream)
      streamRef.current = null
    }
  }, [photo, retryCount, startCamera])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!stream) {
      video.srcObject = null
      return
    }
    video.srcObject = stream
    void video.play().catch((error: unknown) => {
      console.error('Unable to play the verification camera preview:', error)
      setCameraError('capture.cameraPlaybackError')
      setCameraState('error')
    })
    return () => {
      if (video.srcObject === stream) video.srcObject = null
    }
  }, [stream])

  const capture = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || cameraState !== 'ready') return
    const dimensions = imageDimensions(video.videoWidth, video.videoHeight)
    if (!dimensions.width || !dimensions.height) {
      setPhotoError('capture.photoProcessingError')
      return
    }
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    const context = canvas.getContext('2d')
    if (!context) {
      setPhotoError('capture.photoProcessingError')
      return
    }
    context.drawImage(video, 0, 0, dimensions.width, dimensions.height)
    try {
      onChange(await createPhotoFromCanvas(canvas))
      setPhotoError('')
    } catch (error) {
      console.error('Unable to process the verification photo:', error)
      setPhotoError('capture.photoProcessingError')
    }
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    try {
      onChange(await createPhotoFromFile(file))
      setPhotoError('')
    } catch (error) {
      console.error('Unable to process the uploaded verification photo:', error)
      setPhotoError('capture.photoProcessingError')
    }
  }

  return (
    <section className="glass-panel space-y-3 rounded-2xl p-3 sm:p-4">
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label={t('verify.uploadAfter')}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          void upload(file)
        }}
      />
      {photo ? (
        <div className="relative aspect-video overflow-hidden rounded-xl bg-background/60">
          <img
            src={photo.dataUrl}
            alt={t('verify.afterPhotoAlt')}
            className="h-full w-full object-contain"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={t('verify.retakeAfter')}
            className="absolute right-2 top-2 inline-flex items-center gap-2 rounded-lg bg-background/90 px-3 py-2 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t('verify.retakeAfter')}
          </button>
        </div>
      ) : (
        <div className="relative aspect-video overflow-hidden rounded-xl bg-background/60">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={() => setCameraState('ready')}
            onPlaying={() => setCameraState('ready')}
            className="h-full w-full object-cover"
          />
          {cameraState === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label={t('common.loading')} />
            </div>
          )}
          {cameraState === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 p-4 text-center">
              <p role="alert" className="text-sm text-text-secondary">{t(cameraError)}</p>
              <button
                type="button"
                onClick={() => setRetryCount((count) => count + 1)}
                className="rounded-lg border border-primary px-4 py-2 text-sm text-primary focus-visible:outline-2 focus-visible:outline-primary"
              >
                {t('common.retry')}
              </button>
            </div>
          )}
        </div>
      )}
      {!photo && (
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setFacingMode((mode) => mode === 'environment' ? 'user' : 'environment')}
            disabled={cameraState === 'loading'}
            aria-label={t('capture.flip')}
            className="flex min-h-11 items-center justify-center rounded-xl border border-border p-2 text-text-secondary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <SwitchCamera className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void capture()}
            disabled={cameraState !== 'ready'}
            aria-label={t('verify.captureAfter')}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-2 font-semibold text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t('verify.capture')}</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label={t('verify.uploadAfter')}
            className="flex min-h-11 items-center justify-center rounded-xl border border-border p-2 text-text-secondary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Upload className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}
      {!photo && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 px-4 py-2.5 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ImagePlus className="h-5 w-5" aria-hidden="true" />
          {t('verify.uploadAfter')}
        </button>
      )}
      {photoError && <p role="alert" className="text-sm text-error">{t(photoError)}</p>}
    </section>
  )
}
