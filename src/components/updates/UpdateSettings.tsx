import { useState, useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { AlertCircle } from 'lucide-react'

type Channel = 'stable' | 'beta' | 'alpha'

const channelDescriptions: Record<Channel, string> = {
  stable: 'Stable releases only',
  beta: 'Stable and beta releases',
  alpha: 'All releases including alpha'
}

const channelWarnings: Record<Channel, string | null> = {
  stable: null,
  beta: 'Beta releases may contain bugs and incomplete features.',
  alpha: 'Alpha releases are experimental and may be unstable.'
}

interface UpdateSettingsProps {
  compact?: boolean
}

export function UpdateSettings({ compact = false }: UpdateSettingsProps) {
  const [channel, setChannel] = useState<Channel>('stable')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.updater.getChannel().then((ch) => {
      setChannel(ch)
      setLoading(false)
    })
  }, [])

  const handleChannelChange = async (newChannel: Channel) => {
    setChannel(newChannel)
    await window.api.updater.setChannel(newChannel)
  }

  if (loading) {
    return null
  }

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="capitalize">{channel}</span>
              {channel !== 'stable' && (
                <AlertCircle className="h-3 w-3 text-yellow-500" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-sm">{channelDescriptions[channel]}</p>
            {channelWarnings[channel] && (
              <p className="mt-1 text-xs text-yellow-500">{channelWarnings[channel]}</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Update Channel</label>
      <Select value={channel} onValueChange={(v) => handleChannelChange(v as Channel)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="stable">
            <div className="flex flex-col items-start">
              <span>Stable</span>
              <span className="text-xs text-muted-foreground">Recommended</span>
            </div>
          </SelectItem>
          <SelectItem value="beta">
            <div className="flex flex-col items-start">
              <span>Beta</span>
              <span className="text-xs text-muted-foreground">Early features</span>
            </div>
          </SelectItem>
          <SelectItem value="alpha">
            <div className="flex flex-col items-start">
              <span>Alpha</span>
              <span className="text-xs text-muted-foreground">Experimental</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
      {channelWarnings[channel] && (
        <p className="flex items-center gap-1 text-xs text-yellow-500">
          <AlertCircle className="h-3 w-3" />
          {channelWarnings[channel]}
        </p>
      )}
    </div>
  )
}
