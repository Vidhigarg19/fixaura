import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

interface DiagnosticResult {
  https: boolean
  mediaDevicesAPI: boolean
  getUserMedia: boolean
  permissions: 'granted' | 'denied' | 'prompt' | 'unknown'
}

export default function CameraDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const runDiagnostics = async () => {
      const result: DiagnosticResult = {
        https: window.location.protocol === 'https:' || window.location.hostname === 'localhost',
        mediaDevicesAPI: !!navigator.mediaDevices,
        getUserMedia: !!(navigator.mediaDevices?.getUserMedia),
        permissions: 'unknown',
      }

      // Check camera permission status
      if (navigator.permissions) {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName })
          result.permissions = permissionStatus.state
        } catch {
          result.permissions = 'unknown'
        }
      }

      setDiagnostics(result)
    }

    runDiagnostics()
  }, [])

  if (!diagnostics) return null

  const allPassed = diagnostics.https && diagnostics.mediaDevicesAPI && diagnostics.getUserMedia

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!show ? (
        <button
          onClick={() => setShow(true)}
          className="glass-panel rounded-full p-3 text-text-subtle hover:text-primary transition-colors"
          title="Camera Diagnostics"
        >
          <AlertCircle className="h-5 w-5" />
        </button>
      ) : (
        <div className="glass-panel rounded-xl p-4 max-w-sm border border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Camera Diagnostics</h3>
            <button
              onClick={() => setShow(false)}
              className="text-text-subtle hover:text-text-primary"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2 text-sm">
            <DiagnosticItem
              label="HTTPS Enabled"
              passed={diagnostics.https}
              info={diagnostics.https ? 'Secure connection' : 'Camera requires HTTPS'}
            />
            <DiagnosticItem
              label="MediaDevices API"
              passed={diagnostics.mediaDevicesAPI}
              info={diagnostics.mediaDevicesAPI ? 'API available' : 'Browser not supported'}
            />
            <DiagnosticItem
              label="getUserMedia"
              passed={diagnostics.getUserMedia}
              info={diagnostics.getUserMedia ? 'Camera API available' : 'Camera API missing'}
            />
            <DiagnosticItem
              label="Camera Permission"
              passed={diagnostics.permissions === 'granted'}
              info={`Status: ${diagnostics.permissions}`}
              warning={diagnostics.permissions === 'prompt'}
            />
          </div>

          {!allPassed && (
            <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-200">
              ⚠️ Some checks failed. Camera may not work.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DiagnosticItem({
  label,
  passed,
  info,
  warning,
}: {
  label: string
  passed: boolean
  info: string
  warning?: boolean
}) {
  const Icon = passed ? CheckCircle2 : warning ? AlertCircle : XCircle
  const color = passed ? 'text-green-400' : warning ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="flex items-start gap-2">
      <Icon className={`h-4 w-4 mt-0.5 ${color} shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-text-primary font-medium">{label}</p>
        <p className="text-text-subtle text-xs">{info}</p>
      </div>
    </div>
  )
}
