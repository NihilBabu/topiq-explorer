import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Download, RefreshCw, X, CheckCircle, AlertCircle } from 'lucide-react'

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

interface UpdateInfo {
  version: string
  releaseNotes?: string
}

export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>('idle')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Skip in dev mode
    if (import.meta.env.DEV) {
      return
    }

    // Set up event listeners
    const unsubscribeAvailable = window.api.updater.onUpdateAvailable((info) => {
      setUpdateInfo({ version: info.version, releaseNotes: info.releaseNotes })
      setState('available')
      setDismissed(false)
    })

    const unsubscribeProgress = window.api.updater.onDownloadProgress((progress) => {
      setDownloadProgress(progress.percent)
    })

    const unsubscribeDownloaded = window.api.updater.onUpdateDownloaded((info) => {
      setUpdateInfo({ version: info.version, releaseNotes: info.releaseNotes })
      setState('downloaded')
    })

    const unsubscribeError = window.api.updater.onError((errorMsg) => {
      setError(errorMsg)
      setState('error')
    })

    return () => {
      unsubscribeAvailable()
      unsubscribeProgress()
      unsubscribeDownloaded()
      unsubscribeError()
    }
  }, [])

  const handleDownload = async () => {
    setState('downloading')
    setError(null)
    try {
      await window.api.updater.downloadUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
      setState('error')
    }
  }

  const handleInstall = () => {
    window.api.updater.installUpdate()
  }

  const handleRetry = async () => {
    setState('checking')
    setError(null)
    try {
      const result = await window.api.updater.checkForUpdates()
      if (result.updateAvailable) {
        setUpdateInfo({ version: result.version, releaseNotes: result.releaseNotes })
        setState('available')
      } else {
        setState('idle')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed')
      setState('error')
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  // Don't show anything in idle/checking state or if dismissed
  if (state === 'idle' || state === 'checking' || dismissed) {
    return null
  }

  return (
    <div className="fixed bottom-8 right-8 z-50 max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {state === 'available' && (
            <>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Download className="h-4 w-4 text-primary" />
                Update Available
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Version {updateInfo?.version} is ready to download
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={handleDownload}>
                  Download
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismiss}>
                  Later
                </Button>
              </div>
            </>
          )}

          {state === 'downloading' && (
            <>
              <div className="flex items-center gap-2 text-sm font-medium">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                Downloading Update
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Version {updateInfo?.version}
              </p>
              <div className="mt-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {Math.round(downloadProgress)}%
                </p>
              </div>
            </>
          )}

          {state === 'downloaded' && (
            <>
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Ready to Install
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Version {updateInfo?.version} has been downloaded
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={handleInstall}>
                  Restart & Install
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismiss}>
                  Later
                </Button>
              </div>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertCircle className="h-4 w-4 text-destructive" />
                Update Error
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {error || 'An error occurred while updating'}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={handleRetry}>
                  Retry
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismiss}>
                  Dismiss
                </Button>
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
