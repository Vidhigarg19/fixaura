import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, SwitchCamera, Loader2, Upload, ImagePlus } from 'lucide-react'
import PageShell from '../components/PageShell'
import AROverlay from '../components/AROverlay'
import VoiceInput from '../components/VoiceInput'
import SafetyBubble from '../components/SafetyBubble'
import CameraDiagnostics from '../components/CameraDiagnostics'
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
  const [videoReady, setVideoReady] = useState(false)
  const motionRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const startCamera = useCallback(async () => {
    setCameraState('loading')
    setVideoReady(false)
    
    try {
      // Check if mediaDevices is available (HTTPS required)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('Camera API not available. HTTPS required.')
        setCameraState('error')
        return
      }

      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }

      console.log('Requesting camera with facingMode:', facingMode)
      
      // Try with facingMode first
      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: facingMode === 'environment' ? { ideal: 'environment' } : 'user',
            width: { ideal: 1280 }, 
            height: { ideal: 720 } 
          },
          audio: false,
        })
      } catch (err) {
        // Fallback: try without facingMode constraint (some devices don't support it)
        console.warn('Failed with facingMode, trying without constraints:', err)
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 }, 
            height: { ideal: 720 }
          },
          audio: false,
        })
      }

      if (!stream) {
        throw new Error('Failed to get camera stream')
      }

      console.log('Camera stream obtained successfully')
      streamRef.current = stream
      
      if (videoRef.current) {
        const video = videoRef.current
        video.srcObject = stream
        
        // Create a promise that resolves when video is ready
        const videoReadyPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.warn('Video metadata timeout - forcing play')
            reject(new Error('Metadata timeout'))
          }, 5000)
          
          video.onloadedmetadata = () => {
            clearTimeout(timeout)
            console.log('Video metadata loaded, dimensions:', video.videoWidth, 'x', video.videoHeight)
            resolve()
          }
          
          video.onerror = () => {
            clearTimeout(timeout)
            console.error('Video element error')
            reject(new Error('Video error'))
          }
        })
        
        try {
          // Wait for metadata to load
          await videoReadyPromise
          
          // Now play the video
          await video.play()
          console.log('Video playing successfully')
          setVideoReady(true)
          setCameraState('ready')
        } catch (playErr) {
          console.warn('Video play/metadata error, trying direct play:', playErr)
          // Fallback: try to play anyway
          try {
            await video.play()
            console.log('Video playing after fallback')
            setVideoReady(true)
            setCameraState('ready')
          } catch (finalErr) {
            console.error('Final video play error:', finalErr)
            // Still set to ready so user can try to capture
            setVideoReady(true)
            setCameraState('ready')
          }
        }
      } else {
        console.error('Video ref is null')
        setCameraState('error')
      }
    } catch (err) {
      console.error('Camera error:', err)
      
      // Detailed error logging
      if (err instanceof Error) {
        console.error('Error name:', err.name)
        console.error('Error message:', err.message)
      }
      
      // Differentiate between permission denied and other errors
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          console.error('Permission denied by user')
          setCameraState('permission')
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          console.error('No camera device found')
          setCameraState('error')
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          console.error('Camera is in use by another application')
          setCameraState('error')
        } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
          console.error('Camera constraints not satisfied')
          setCameraState('error')
        } else if (err.name === 'SecurityError') {
          console.error('Security error - HTTPS required')
          setCameraState('error')
        } else {
          console.error('Unknown camera error')
          setCameraState('error')
        }
      } else {
        setCameraState('error')
      }
    }
  }, [facingMode])

  useEffect(() => {
    setVideoReady(false)
    startCamera()
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      setVideoReady(false)
    }
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || analyzing) return
    setAnalyzing(true)
    try {
      const canvas = canvasRef.current
      if (!canvas) throw new Error('no canvas')
      const img = new Image()
      const url = URL.createObjectURL(file)
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = url
      })
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no context')
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9)
      )
      if (!blob) throw new Error('upload processing failed')
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
        
        {/* Debug info */}
        {cameraState === 'ready' && videoRef.current && (
          <div className="glass-panel rounded-lg px-3 py-1 text-xs text-text-secondary">
            {videoRef.current.videoWidth}x{videoRef.current.videoHeight}
          </div>
        )}
        
        <VoiceInput onCommand={handleVoice} />
      </div>

      <div className="relative flex-1 min-h-[70vh] bg-black">
        {cameraState === 'ready' && (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover bg-black"
              style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
            />
            {/* Show loading overlay if video not ready */}
            {!videoReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
                <div className="text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-text-secondary text-sm">Initializing camera...</p>
                </div>
              </div>
            )}
            {/* Subtle overlay for better text visibility */}
            {videoReady && <div className="absolute inset-0 bg-black/5 pointer-events-none" />}
            <AROverlay variant="capture" />
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: videoReady ? 1 : 0 }}
              className="absolute bottom-32 left-0 right-0 text-center text-sm text-white drop-shadow-lg px-6 z-10"
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
              <p className="text-text-secondary mb-4">
                {cameraState === 'permission'
                  ? t('capture.permissionBody')
                  : t('capture.errorBody')}
              </p>
              
              {/* HTTPS Warning */}
              {window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && (
                <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-sm text-yellow-200">
                    ⚠️ Camera requires HTTPS. Please access via <strong>https://</strong>
                  </p>
                </div>
              )}
              
              {/* Permission Reset Instructions */}
              <div className="mb-4 p-4 bg-primary/10 border border-primary/30 rounded-lg text-left">
                <p className="text-sm font-semibold text-primary mb-2">🔧 Quick Fix:</p>
                <ol className="text-sm text-text-secondary space-y-1 list-decimal list-inside">
                  <li>Click the 🔒 or 🎥 icon in your browser's address bar</li>
                  <li>Change Camera permission to "Allow"</li>
                  <li>Refresh this page or click "Try again" below</li>
                </ol>
              </div>

              {/* Upload Photo Fallback — prominent */}
              <div className="mb-4 p-4 bg-surface-high rounded-xl border border-border">
                <p className="text-sm text-text-secondary mb-3">Or skip the camera entirely:</p>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={analyzing}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-background disabled:opacity-50"
                >
                  {analyzing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-5 w-5" />
                  )}
                  {analyzing ? t('capture.analyzing') : t('capture.uploadPhoto')}
                </motion.button>
              </div>
              
              {/* Troubleshooting tips */}
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-primary hover:underline">
                  More troubleshooting tips
                </summary>
                <ul className="mt-3 text-sm text-text-secondary space-y-2 list-disc list-inside">
                  <li>Ensure you're using HTTPS (not HTTP)</li>
                  <li>Close other apps that might be using the camera</li>
                  <li>Try a different browser (Chrome, Safari, Edge)</li>
                  <li>Restart your browser</li>
                  <li>Check if camera works in other websites</li>
                </ul>
              </details>
              
              <div className="flex gap-3 justify-center">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={startCamera}
                  className="rounded-xl border border-primary px-5 py-2.5 text-sm font-semibold text-primary"
                >
                  {t('capture.permissionRetry')}
                </motion.button>
                
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => window.location.reload()}
                  className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-text-secondary"
                >
                  Refresh Page
                </motion.button>
              </div>
            </div>
          </div>
        )}

        {cameraState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        )}
      </div>

      {/* Hidden file input for upload fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileUpload}
      />

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

        {/* Upload button — always available as alternative */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={analyzing}
          className="glass-panel rounded-full p-3 disabled:opacity-50"
          aria-label={t('capture.uploadPhoto')}
        >
          <Upload className="h-6 w-6 text-text-secondary" />
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

      {/* Camera Diagnostics Tool - helpful for debugging */}
      {(cameraState === 'permission' || cameraState === 'error') && <CameraDiagnostics />}
    </PageShell>
  )
}
