import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'

type CheckState = 'idle' | 'checking' | 'up-to-date' | 'update-available' | 'error'

export function UpdateChecker() {
  const [state, setState] = useState<CheckState>('idle')
  const [appVersion, setAppVersion] = useState('')
  const [availableVersion, setAvailableVersion] = useState('')

  useEffect(() => {
    window.api.updater.getVersion().then(setAppVersion)
  }, [])

  useEffect(() => {
    const unsubAvailable = window.api.updater.onUpdateAvailable((info) => {
      setAvailableVersion(info.version)
      setState('update-available')
    })

    const unsubNotAvailable = window.api.updater.onUpdateNotAvailable(() => {
      setState('up-to-date')
    })

    const unsubError = window.api.updater.onError(() => {
      setState('error')
    })

    return () => {
      unsubAvailable()
      unsubNotAvailable()
      unsubError()
    }
  }, [])

  // Auto-return to idle after transient states
  useEffect(() => {
    if (state === 'up-to-date' || state === 'error') {
      const timer = setTimeout(() => setState('idle'), 3000)
      return () => clearTimeout(timer)
    }
  }, [state])

  const handleCheck = useCallback(async () => {
    if (state === 'checking') return
    setState('checking')
    try {
      const result = await window.api.updater.checkForUpdates()
      if (result.updateAvailable) {
        setAvailableVersion(result.version)
        setState('update-available')
      } else {
        setState('up-to-date')
      }
    } catch {
      setState('error')
    }
  }, [state])

  const label =
    state === 'checking' ? 'Checking...' :
    state === 'up-to-date' ? 'Up to date' :
    state === 'update-available' ? `v${availableVersion} available` :
    state === 'error' ? 'Check failed' :
    `v${appVersion || '...'}`

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleCheck}
            disabled={state === 'checking'}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
          >
            {state === 'checking' ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : state === 'update-available' ? (
              <span className="h-1.5 w-1.5 rounded-full bg-accent-active" />
            ) : null}
            <span className="font-mono">{label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">Click to check for updates</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
