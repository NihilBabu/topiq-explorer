import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Filter } from 'lucide-react'
import type { MessageOptions } from '@/types/kafka.types'

interface MessageFiltersProps {
  filters: MessageOptions
  onFilterChange: (filters: MessageOptions) => void
}

export function MessageFilters({ filters, onFilterChange }: MessageFiltersProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [localFilters, setLocalFilters] = useState<MessageOptions>(filters)

  const handleApply = () => {
    onFilterChange(localFilters)
    setIsOpen(false)
  }

  const handleReset = () => {
    const defaultFilters = { limit: 100 }
    setLocalFilters(defaultFilters)
    onFilterChange(defaultFilters)
    setIsOpen(false)
  }

  const hasActiveFilters =
    filters.partition !== undefined || filters.fromOffset !== undefined || filters.fromTimestamp !== undefined

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant={hasActiveFilters ? 'secondary' : 'outline'} size="sm">
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {hasActiveFilters && <span className="ml-2 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">!</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Partition</Label>
            <Input
              type="number"
              placeholder="All partitions"
              value={localFilters.partition?.toString() || ''}
              onChange={(e) =>
                setLocalFilters({
                  ...localFilters,
                  partition: e.target.value ? parseInt(e.target.value, 10) : undefined
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>From Offset</Label>
            <Input
              placeholder="Start from offset"
              value={localFilters.fromOffset || ''}
              onChange={(e) =>
                setLocalFilters({
                  ...localFilters,
                  fromOffset: e.target.value || undefined
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Limit</Label>
            <Select
              value={localFilters.limit?.toString() || '100'}
              onValueChange={(v) => setLocalFilters({ ...localFilters, limit: parseInt(v, 10) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50 messages</SelectItem>
                <SelectItem value="100">100 messages</SelectItem>
                <SelectItem value="200">200 messages</SelectItem>
                <SelectItem value="500">500 messages</SelectItem>
                <SelectItem value="1000">1000 messages</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Reset
            </Button>
            <Button size="sm" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
