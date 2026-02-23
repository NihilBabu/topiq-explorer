import { useState, useMemo, useCallback, useEffect, memo } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { useTopicStore } from '@/stores/topic.store'
import { useConnectionStore } from '@/stores/connection.store'
import { MessageFilters } from './MessageFilters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatJson, formatTimestamp, tryParseJson } from '@/lib/utils'
import { RefreshCw, Copy, ChevronDown, ChevronRight, MessageSquare, Trash2, RotateCcw, Loader2, Search, X, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import type { KafkaMessage, MessageOptions } from '@/types/kafka.types'

interface ParsedMessage extends KafkaMessage {
  parsedValue: unknown
  isJson: boolean
  messageId: string
  stringifiedPreview: string
  _searchText: string
}

interface MessageRowProps {
  message: ParsedMessage
  isExpanded: boolean
  onToggle: (messageId: string) => void
  onCopy: (message: ParsedMessage) => void
  onRepublish: (message: ParsedMessage) => void
  onTombstone: (message: ParsedMessage) => void
}

const MessageRow = memo(function MessageRow({ message, isExpanded, onToggle, onCopy, onRepublish, onTombstone }: MessageRowProps) {
  return (
    <div className="group border-b border-border last:border-b-0">
      <div
        className="flex items-start gap-2 p-3 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => onToggle(message.messageId)}
      >
        <button className="mt-1 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              P{message.partition}
            </Badge>
            <Badge variant="secondary" className="font-mono text-xs">
              O{message.offset}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatTimestamp(message.timestamp)}
            </span>
            {message.key && (
              <Badge variant="outline" className="font-mono text-xs">
                Key: {message.key}
              </Badge>
            )}
          </div>

          <div className="mt-1 truncate font-mono text-sm text-muted-foreground">
            {message.stringifiedPreview || '(empty)'}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onCopy(message)
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>

      {isExpanded && (
        <div className="border-t border-border bg-muted/30 p-4">
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Value</h4>
              <pre className="json-viewer overflow-auto rounded-md bg-background p-3 text-sm">
                {message.isJson ? formatJson(message.value || '') : message.value || '(empty)'}
              </pre>
            </div>

            {message.key && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">Key</h4>
                <pre className="json-viewer overflow-auto rounded-md bg-background p-3 text-sm">
                  {message.key}
                </pre>
              </div>
            )}

            {Object.keys(message.headers).length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">Headers</h4>
                <pre className="json-viewer overflow-auto rounded-md bg-background p-3 text-sm">
                  {JSON.stringify(message.headers, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Partition: {message.partition}</span>
                <span>Offset: {message.offset}</span>
                <span>Timestamp: {formatTimestamp(message.timestamp)}</span>
              </div>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRepublish(message)
                        }}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Republish
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Create a new message with this data pre-filled</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {message.key && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            onTombstone(message)
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Tombstone
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Send a null message for this key (compacted topics only)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export function MessageViewer() {
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<MessageOptions>({ limit: 100 })
  const [tombstoneMessage, setTombstoneMessage] = useState<ParsedMessage | null>(null)
  const [isSendingTombstone, setIsSendingTombstone] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')

  // Client-side filter debounce (for 1-2 char queries)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const messages = useTopicStore((state) => state.messages)
  const isLoadingMessages = useTopicStore((state) => state.isLoadingMessages)
  const selectedTopic = useTopicStore((state) => state.selectedTopic)
  const loadMessages = useTopicStore((state) => state.loadMessages)
  const produceMessage = useTopicStore((state) => state.produceMessage)
  const setMessageToRepublish = useTopicStore((state) => state.setMessageToRepublish)
  const messageError = useTopicStore((state) => state.messageError)
  const hasMore = useTopicStore((state) => state.hasMore)
  const isLoadingMore = useTopicStore((state) => state.isLoadingMore)
  const loadMoreMessages = useTopicStore((state) => state.loadMoreMessages)
  const activeConnectionId = useConnectionStore((state) => state.activeConnectionId)

  // Server-side search state
  const isSearchActive = useTopicStore((state) => state.isSearchActive)
  const isSearching = useTopicStore((state) => state.isSearching)
  const searchResults = useTopicStore((state) => state.searchResults)
  const searchScanned = useTopicStore((state) => state.searchScanned)
  const searchHasMore = useTopicStore((state) => state.searchHasMore)
  const searchError = useTopicStore((state) => state.searchError)
  const searchMessages = useTopicStore((state) => state.searchMessages)
  const searchMoreMessages = useTopicStore((state) => state.searchMoreMessages)
  const clearSearch = useTopicStore((state) => state.clearSearch)

  // Server-side search trigger (for 3+ char queries)
  useEffect(() => {
    if (searchQuery.trim().length >= 3 && activeConnectionId && selectedTopic) {
      const timer = setTimeout(() => {
        searchMessages(activeConnectionId, selectedTopic, searchQuery.trim(), filters.partition)
      }, 500)
      return () => clearTimeout(timer)
    } else if (searchQuery.trim().length < 3 && isSearchActive) {
      clearSearch()
    }
  }, [searchQuery, activeConnectionId, selectedTopic, filters.partition, searchMessages, clearSearch, isSearchActive])

  // Memoize parsed messages to avoid re-parsing JSON on every render
  const parsedMessages = useMemo<ParsedMessage[]>(() => {
    return messages.map((message) => {
      const { parsed, isJson } = tryParseJson(message.value || '')
      const stringified = isJson ? JSON.stringify(parsed) : (message.value || '')
      const preview = stringified.substring(0, 100) + (stringified.length > 100 ? '...' : '')
      const headerEntries = Object.entries(message.headers ?? {}).flatMap(([k, v]) => [k, String(v)])
      return {
        ...message,
        parsedValue: parsed,
        isJson,
        messageId: `${message.partition}-${message.offset}`,
        stringifiedPreview: preview,
        _searchText: [preview, message.value || '', message.key || '', ...headerEntries].join('\0').toLowerCase()
      }
    })
  }, [messages])

  const filteredMessages = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return parsedMessages
    const query = debouncedSearchQuery.toLowerCase()
    return parsedMessages.filter((message) => message._searchText.includes(query))
  }, [parsedMessages, debouncedSearchQuery])

  // Parse search results the same way as regular messages
  const parsedSearchResults = useMemo<ParsedMessage[]>(() => {
    return searchResults.map((message) => {
      const { parsed, isJson } = tryParseJson(message.value || '')
      const stringified = isJson ? JSON.stringify(parsed) : (message.value || '')
      const preview = stringified.substring(0, 100) + (stringified.length > 100 ? '...' : '')
      const headerEntries = Object.entries(message.headers ?? {}).flatMap(([k, v]) => [k, String(v)])
      return {
        ...message,
        parsedValue: parsed,
        isJson,
        messageId: `${message.partition}-${message.offset}`,
        stringifiedPreview: preview,
        _searchText: [preview, message.value || '', message.key || '', ...headerEntries].join('\0').toLowerCase()
      }
    })
  }, [searchResults])

  const displayMessages = isSearchActive ? parsedSearchResults : filteredMessages

  const handleRefresh = useCallback(async () => {
    if (!activeConnectionId || !selectedTopic) return
    await loadMessages(activeConnectionId, selectedTopic, filters)
  }, [activeConnectionId, selectedTopic, filters, loadMessages])

  const handleLoadMore = useCallback(async () => {
    if (!activeConnectionId || !selectedTopic) return
    await loadMoreMessages(activeConnectionId, selectedTopic)
  }, [activeConnectionId, selectedTopic, loadMoreMessages])

  const handleSearchMore = useCallback(async () => {
    if (!activeConnectionId || !selectedTopic) return
    await searchMoreMessages(activeConnectionId, selectedTopic)
  }, [activeConnectionId, selectedTopic, searchMoreMessages])

  const handleFilterChange = useCallback(async (newFilters: MessageOptions) => {
    setFilters(newFilters)
    if (!activeConnectionId || !selectedTopic) return
    await loadMessages(activeConnectionId, selectedTopic, newFilters)
  }, [activeConnectionId, selectedTopic, loadMessages])

  const toggleExpanded = useCallback((messageId: string) => {
    setExpandedMessages((prev) => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(messageId)) {
        newExpanded.delete(messageId)
      } else {
        newExpanded.add(messageId)
      }
      return newExpanded
    })
  }, [])

  const copyToClipboard = useCallback(async (message: ParsedMessage) => {
    const content = JSON.stringify(
      {
        partition: message.partition,
        offset: message.offset,
        timestamp: message.timestamp,
        key: message.key,
        value: message.parsedValue,
        headers: message.headers
      },
      null,
      2
    )
    await navigator.clipboard.writeText(content)
    toast({ title: 'Copied', description: 'Message copied to clipboard' })
  }, [])

  const handleTombstone = useCallback(async () => {
    if (!activeConnectionId || !selectedTopic || !tombstoneMessage?.key) return

    setIsSendingTombstone(true)
    try {
      await produceMessage(activeConnectionId, selectedTopic, {
        key: tombstoneMessage.key,
        value: null,
        partition: tombstoneMessage.partition
      })

      toast({
        title: 'Tombstone Sent',
        description: `Tombstone message sent for key "${tombstoneMessage.key}"`
      })

      // Refresh messages
      await loadMessages(activeConnectionId, selectedTopic, filters)
    } catch (error) {
      toast({
        title: 'Tombstone Failed',
        description: error instanceof Error ? error.message : 'Failed to send tombstone',
        variant: 'destructive'
      })
    } finally {
      setIsSendingTombstone(false)
      setTombstoneMessage(null)
    }
  }, [activeConnectionId, selectedTopic, tombstoneMessage, produceMessage, loadMessages, filters])

  const handleRepublish = useCallback((message: ParsedMessage) => {
    if (!setMessageToRepublish) return
    setMessageToRepublish({
      key: message.key || undefined,
      value: message.value || '',
      headers: message.headers,
      partition: message.partition
    })
    toast({ title: 'Message Ready', description: 'Open the message producer to republish' })
  }, [setMessageToRepublish])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 pb-4">
        <MessageFilters filters={filters} onFilterChange={handleFilterChange} />
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearchQuery('')
            }}
            className="h-9 pl-9 pr-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoadingMessages}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingMessages ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex-1 rounded-md border border-border overflow-hidden">
        {messageError && !isLoadingMessages ? (
          <div className="flex h-full items-center justify-center py-12">
            <div className="text-center">
              <AlertCircle className="mx-auto h-8 w-8 mb-2 text-destructive" />
              <p className="text-sm text-muted-foreground mb-3">{messageError}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          </div>
        ) : (isLoadingMessages || (isSearching && !isSearchActive)) && parsedMessages.length === 0 ? (
          <div className="divide-y divide-border">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-2 p-3">
                <Skeleton className="h-4 w-4 mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="h-5 w-12 rounded-full" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : isSearching && displayMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              <Loader2 className="mx-auto h-8 w-8 mb-2 animate-spin" />
              <p>Searching messages...</p>
            </div>
          </div>
        ) : displayMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              {isSearchActive ? (
                <>
                  <Search className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  <p>No messages match "{searchQuery}"</p>
                  {searchScanned > 0 && (
                    <p className="text-xs mt-1">{searchScanned.toLocaleString()} messages scanned</p>
                  )}
                </>
              ) : searchQuery.trim() ? (
                <>
                  <Search className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  <p>No messages match "{searchQuery}"</p>
                </>
              ) : (
                <>
                  <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  <p>No messages found</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
          {isLoadingMessages && parsedMessages.length > 0 && !isSearchActive && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground border-b border-border bg-muted/30">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading messages...
            </div>
          )}
          {isSearching && isSearchActive && displayMessages.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground border-b border-border bg-muted/30">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning for more matches...
            </div>
          )}
          <Virtuoso
            data={displayMessages}
            itemContent={(_, message) => (
              <MessageRow
                message={message}
                isExpanded={expandedMessages.has(message.messageId)}
                onToggle={toggleExpanded}
                onCopy={copyToClipboard}
                onRepublish={handleRepublish}
                onTombstone={setTombstoneMessage}
              />
            )}
          />
          </>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
        <span>
          {isSearchActive
            ? isSearching
              ? 'Scanning...'
              : `${displayMessages.length} matches found (${searchScanned.toLocaleString()} messages scanned)`
            : searchQuery.trim()
              ? `${filteredMessages.length} of ${parsedMessages.length} messages match`
              : `${messages.length} messages loaded`}
        </span>
        <div className="flex items-center gap-2">
          {searchError && (
            <span className="text-destructive">{searchError}</span>
          )}
          {isSearchActive && searchHasMore && !isSearching && (
            <Button variant="outline" size="sm" onClick={handleSearchMore}>
              Scan More
            </Button>
          )}
          {!isSearchActive && hasMore && !searchQuery.trim() && (
            <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={isLoadingMore}>
              {isLoadingMore && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Load More
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={!!tombstoneMessage} onOpenChange={() => setTombstoneMessage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Tombstone Message</AlertDialogTitle>
            <AlertDialogDescription>
              This will produce a message with a null value for the key "{tombstoneMessage?.key}".
              <span className="block mt-2 text-warning">
                Note: Tombstones only work on topics with log compaction enabled. The original message will remain until compaction runs.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleTombstone} disabled={isSendingTombstone}>
              {isSendingTombstone && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Tombstone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
