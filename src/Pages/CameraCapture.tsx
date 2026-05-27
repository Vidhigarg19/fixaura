import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, SwitchCamera, Loader2 } from 'lucide-react'
import PageShell from '../components/PageShell'
import AROverlay from '../components/AROverlay'
import VoiceInput from '../components/VoiceInput'
import SafetyBubble from '../components/SafetyBubble'
import { analyzeImage } from '../services/visionAI'
import { setDiagnosis } from '../services/repairSession'
import { t } from '../i18n'

type CameraState = 'loading' | 'ready' | 'permission' | 'error'

export default function CameraCapture() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cameraState, setCameraState] = useState<CameraState>('loading')
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [analyzing, setAnalyzing] = useState(false)
  const [unsafeWarning, setUnsafeWarning] = useState<string | null>(null)
  const [showSafety, setShowSafety] = useState(false)
  const motionRef = useRef(0)

  const startCamera = useCallback(async () => {
    setCameraState('loading')
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode === 'environment'
                    ? { ideal: 'environment' }
                    : 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraState('ready')
    } catch {
      setCameraState('permission')
    }
  }, [facingMode])

  useEffect(() => {
    startCamera()
    return () => streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [startCamera])

  useEffect(() => {
    if (cameraState !== 'ready' || !videoRef.current) return
    let frame = 0
    const id = setInterval(() => {
      const v = videoRef.current
      if (!v?.videoWidth) return
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = 32
      canvas.height = 32
      ctx.drawImage(v, 0, 0, 32, 32)
      const data = ctx.getImageData(0, 0, 32, 32).data
      let brightness = 0
      for (let i = 0; i < data.length; i += 4) {
        brightness += (data[i] + data[i + 1] + data[i + 2]) / 3
      }
      brightness /= data.length / 4
      if (brightness < 40) setUnsafeWarning(t('capture.unsafeLighting'))
      else if (frame > 0 && Math.abs(brightness - motionRef.current) > 25) {
        setUnsafeWarning(t('capture.unstableMotion'))
      } else setUnsafeWarning(null)
      motionRef.current = brightness
      frame++
    }, 800)
    return () => clearInterval(id)
  }, [cameraState])

  const capture = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || analyzing) return

    if (unsafeWarning) {
      setShowSafety(true)
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    setAnalyzing(true)

    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9)
      )
      if (!blob) throw new Error('capture failed')
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      const diagnosis = await analyzeImage(blob)
      setDiagnosis(diagnosis, dataUrl)
      navigate('/diagnosis')
    } catch {
      setCameraState('error')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleVoice = (text: string) => {
    if (text.includes('photo') || text.includes('capture') || text.includes('scan')) {
      void capture()
    }
  }

  return (
    <PageShell className="relative flex flex-col">
      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4">
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/')}
          className="glass-panel rounded-full p-2"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </motion.button>
        <VoiceInput onCommand={handleVoice} />
      </div>

      <div className="relative flex-1 min-h-[70vh] bg-black">
        {cameraState === 'ready' && (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              onLoadedMetadata={() => {
                 videoRef.current?.play()
              }}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-background/40" />
            <AROverlay variant="capture" />
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute bottom-32 left-0 right-0 text-center text-sm text-text-primary px-6"
            >
              {t('capture.instruction')}
            </motion.p>
          </>
        )}

        {(cameraState === 'permission' || cameraState === 'error') && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="glass-panel rounded-xl p-8 max-w-md text-center">
              <h2 className="text-heading-md mb-2">
                {cameraState === 'permission'
                  ? t('capture.permissionTitle')
                  : t('capture.errorTitle')}
              </h2>
              <p className="text-text-secondary mb-6">
                {cameraState === 'permission'
                  ? t('capture.permissionBody')
                  : t('capture.errorBody')}
              </p>
              <motion.button
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={startCamera}
                className="rounded-xl bg-primary px-6 py-3 font-semibold text-background"
              >
                {t('capture.permissionRetry')}
              </motion.button>
            </div>
          </div>
        )}

        {cameraState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        )}
      </div>

      <div className="relative z-20 flex items-center justify-center gap-8 py-8 bg-background border-t border-border">
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))}
          className="glass-panel rounded-full p-3"
          aria-label={t('capture.flip')}
        >
          <SwitchCamera className="h-6 w-6 text-text-secondary" />
        </motion.button>

        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          disabled={cameraState !== 'ready' || analyzing}
          onClick={() => void capture()}
          className="relative h-20 w-20 rounded-full border-4 border-primary bg-primary/20 flex items-center justify-center disabled:opacity-50 animate-pulse-glow"
          aria-label={t('capture.capture')}
        >
          {analyzing ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <Camera className="h-8 w-8 text-primary" />
          )}
        </motion.button>
      </div>

      {analyzing && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-md">
          <p className="text-body-lg shimmer-loading px-8 py-4 rounded-xl">
            {t('capture.analyzing')}
          </p>
        </div>
      )}

      <SafetyBubble
        open={showSafety}
        message={unsafeWarning ?? ''}
        onConfirm={() => {
          setShowSafety(false)
          void capture()
        }}
        onCancel={() => setShowSafety(false)}
      />
    </PageShell>
  )
}
