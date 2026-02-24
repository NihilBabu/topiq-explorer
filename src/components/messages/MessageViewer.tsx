import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { useTopicStore } from '@/stores/topic.store'
import { useConnectionStore } from '@/stores/connection.store'
import { MessageFilters } from './MessageFilters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatJson, formatTimestamp, tryParseJson } from '@/lib/utils'
import { RefreshCw, Copy, ChevronDown, ChevronRight, ChevronLeft, MessageSquare, Trash2, RotateCcw, Loader2, Search, X, AlertCircle } from 'lucide-react'
import { HighlightText } from './HighlightText'
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
  _parsed?: { value: unknown; isJson: boolean }
  messageId: string
  stringifiedPreview: string
  _searchText: string
}

/** Lazily parse JSON — result is cached on the message object */
function getParsed(message: ParsedMessage): { value: unknown; isJson: boolean } {
  if (!message._parsed) {
    const { parsed, isJson } = tryParseJson(message.value || '')
    message._parsed = { value: parsed, isJson }
  }
  return message._parsed
}

interface MessageRowProps {
  message: ParsedMessage
  isExpanded: boolean
  searchQuery: string
  onToggle: (messageId: string) => void
  onCopy: (message: ParsedMessage) => void
  onRepublish: (message: ParsedMessage) => void
  onTombstone: (message: ParsedMessage) => void
}

const MessageRow = memo(function MessageRow({ message, isExpanded, searchQuery, onToggle, onCopy, onRepublish, onTombstone }: MessageRowProps) {
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
                Key: <HighlightText text={message.key} query={searchQuery} />
              </Badge>
            )}
          </div>

          <div className="mt-1 truncate font-mono text-sm text-muted-foreground">
            <HighlightText text={message.stringifiedPreview || '(empty)'} query={searchQuery} />
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

      {isExpanded && (() => {
        const { isJson } = getParsed(message)
        return (
        <div className="border-t border-border bg-muted/30 p-4">
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Value</h4>
              <pre className="json-viewer overflow-auto rounded-md bg-background p-3 text-sm">
                <HighlightText text={isJson ? formatJson(message.value || '') : message.value || '(empty)'} query={searchQuery} />
              </pre>
            </div>

            {message.key && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">Key</h4>
                <pre className="json-viewer overflow-auto rounded-md bg-background p-3 text-sm">
                  <HighlightText text={message.key} query={searchQuery} />
                </pre>
              </div>
            )}

            {Object.keys(message.headers).length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">Headers</h4>
                <pre className="json-viewer overflow-auto rounded-md bg-background p-3 text-sm">
                  <HighlightText text={JSON.stringify(message.headers, null, 2)} query={searchQuery} />
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
        )
      })()}
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
  const [currentPage, setCurrentPage] = useState(1)
  const [pageOffsetCache, setPageOffsetCache] = useState<Map<number, { offset: string; partition?: number }>>(new Map())
  const [searchPage, setSearchPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [searchPageInput, setSearchPageInput] = useState('1')

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
  const isLoadingMore = useTopicStore((state) => state.isLoadingMore)
  const topicMetadata = useTopicStore((state) => state.topicMetadata)
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

  // Track isSearchActive in a ref to avoid triggering the effect when it changes
  const isSearchActiveRef = useRef(isSearchActive)
  isSearchActiveRef.current = isSearchActive

  // Server-side search trigger (for 3+ char queries)
  useEffect(() => {
    if (searchQuery.trim().length >= 3 && activeConnectionId && selectedTopic) {
      const timer = setTimeout(() => {
        searchMessages(activeConnectionId, selectedTopic, searchQuery.trim(), filters.partition)
      }, 500)
      return () => clearTimeout(timer)
    } else if (searchQuery.trim().length < 3 && isSearchActiveRef.current) {
      clearSearch()
    }
  }, [searchQuery, activeConnectionId, selectedTopic, filters.partition, searchMessages, clearSearch])

  // Reset pagination on topic, filter, or search changes
  useEffect(() => {
    setCurrentPage(1)
    setPageOffsetCache(new Map())
    setSearchPage(1)
  }, [selectedTopic, filters, searchQuery])

  // Sync page inputs with current page values
  useEffect(() => { setPageInput(String(currentPage)) }, [currentPage])
  useEffect(() => { setSearchPageInput(String(searchPage)) }, [searchPage])

  // Derive active search query for highlighting (covers both client-side and server-side search)
  const activeSearchQuery = searchQuery.trim()

  // Build lightweight message wrappers — defer JSON parsing to expansion time
  const parsedMessages = useMemo<ParsedMessage[]>(() => {
    return messages.map((message) => {
      const raw = message.value || ''
      const preview = raw.substring(0, 100) + (raw.length > 100 ? '...' : '')
      const headerEntries = Object.entries(message.headers ?? {}).flatMap(([k, v]) => [k, String(v)])
      return {
        ...message,
        messageId: `${message.partition}-${message.offset}`,
        stringifiedPreview: preview,
        _searchText: [raw, message.key || '', ...headerEntries].join('\0').toLowerCase()
      }
    })
  }, [messages])

  const filteredMessages = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return parsedMessages
    const query = debouncedSearchQuery.toLowerCase()
    return parsedMessages.filter((message) => message._searchText.includes(query))
  }, [parsedMessages, debouncedSearchQuery])

  // Build lightweight search result wrappers — defer JSON parsing to expansion
  const parsedSearchResults = useMemo<ParsedMessage[]>(() => {
    return searchResults.map((message) => {
      const raw = message.value || ''
      const preview = raw.substring(0, 100) + (raw.length > 100 ? '...' : '')
      return {
        ...message,
        messageId: `${message.partition}-${message.offset}`,
        stringifiedPreview: preview,
        _searchText: '' // Not used for server-side search results
      }
    })
  }, [searchResults])

  const pageSize = filters.limit || 100

  const totalMessages = useMemo(() => {
    if (!topicMetadata) return 0
    const parts = filters.partition !== undefined
      ? topicMetadata.partitions.filter(p => p.partition === filters.partition)
      : topicMetadata.partitions
    return parts.reduce((sum, p) => sum + (parseInt(p.high) - parseInt(p.low)), 0)
  }, [topicMetadata, filters.partition])

  const totalPages = useMemo(() => {
    if (totalMessages === 0) return 1
    return Math.max(1, Math.ceil(totalMessages / pageSize))
  }, [totalMessages, pageSize])

  // For search results: client-side pagination through accumulated results
  const searchDisplayMessages = useMemo(() => {
    if (!isSearchActive) return []
    const start = (searchPage - 1) * pageSize
    return parsedSearchResults.slice(start, start + pageSize)
  }, [isSearchActive, parsedSearchResults, searchPage, pageSize])

  const searchTotalPages = isSearchActive ? Math.max(1, Math.ceil(parsedSearchResults.length / pageSize)) : 1

  // For normal messages: the full page is already loaded from backend
  const displayMessages = isSearchActive ? searchDisplayMessages : filteredMessages

  const handleRefresh = useCallback(async () => {
    if (!activeConnectionId || !selectedTopic) return
    setCurrentPage(1)
    setPageOffsetCache(new Map())
    await loadMessages(activeConnectionId, selectedTopic, filters)
  }, [activeConnectionId, selectedTopic, filters, loadMessages])

  const handleJumpToPage = useCallback(async (page: number) => {
    if (!activeConnectionId || !selectedTopic) return
    if (page < 1 || page > totalPages || page === currentPage) return

    setCurrentPage(page)

    if (page === 1) {
      await loadMessages(activeConnectionId, selectedTopic, filters)
    } else {
      const cached = pageOffsetCache.get(page)
      if (cached) {
        await loadMessages(activeConnectionId, selectedTopic, { ...filters, fromOffset: cached.offset, partition: cached.partition })
      } else if (topicMetadata) {
        const parts = filters.partition !== undefined
          ? topicMetadata.partitions.filter(p => p.partition === filters.partition)
          : topicMetadata.partitions
        if (parts.length === 0) return

        const skip = (page - 1) * pageSize
        if (parts.length === 1) {
          const fromOffset = String(parseInt(parts[0].low) + skip)
          await loadMessages(activeConnectionId, selectedTopic, { ...filters, fromOffset })
        } else {
          const minLow = Math.min(...parts.map(p => parseInt(p.low)))
          const perPartitionSkip = Math.floor(skip / parts.length)
          const fromOffset = String(minLow + perPartitionSkip)
          await loadMessages(activeConnectionId, selectedTopic, { ...filters, fromOffset })
        }
      }
    }

    // Cache nextOffset for sequential forward navigation
    const state = useTopicStore.getState()
    if (state.nextOffset) {
      setPageOffsetCache(prev => {
        const next = new Map(prev)
        next.set(page + 1, { offset: state.nextOffset!, partition: state.nextPartition })
        return next
      })
    }
  }, [activeConnectionId, selectedTopic, totalPages, currentPage, pageOffsetCache, filters, topicMetadata, pageSize, loadMessages])

  const handleNextPage = useCallback(async () => {
    if (isSearchActive) {
      if (searchPage < searchTotalPages) {
        setSearchPage(searchPage + 1)
      }
      return
    }
    await handleJumpToPage(currentPage + 1)
  }, [isSearchActive, searchPage, searchTotalPages, currentPage, handleJumpToPage])

  const handlePrevPage = useCallback(async () => {
    if (isSearchActive) {
      if (searchPage > 1) {
        setSearchPage(searchPage - 1)
      }
      return
    }
    await handleJumpToPage(currentPage - 1)
  }, [isSearchActive, searchPage, currentPage, handleJumpToPage])

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
    const { value: parsedValue } = getParsed(message)
    const content = JSON.stringify(
      {
        partition: message.partition,
        offset: message.offset,
        timestamp: message.timestamp,
        key: message.key,
        value: parsedValue,
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
                searchQuery={activeSearchQuery}
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
              : `${parsedSearchResults.length} matches found (${searchScanned.toLocaleString()} messages scanned)`
            : searchQuery.trim()
              ? `${filteredMessages.length} of ${parsedMessages.length} messages match`
              : totalMessages > 0
                ? `${((currentPage - 1) * pageSize + 1).toLocaleString()}–${((currentPage - 1) * pageSize + messages.length).toLocaleString()} of ~${totalMessages.toLocaleString()} messages`
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
          {isSearchActive ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setSearchPage(searchPage - 1)}
                disabled={searchPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 flex items-center gap-1">
                Page
                <input
                  type="text"
                  inputMode="numeric"
                  value={searchPageInput}
                  onChange={(e) => setSearchPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const page = parseInt(searchPageInput)
                      if (!isNaN(page) && page >= 1 && page <= searchTotalPages) {
                        setSearchPage(page)
                      } else {
                        setSearchPageInput(String(searchPage))
                      }
                    }
                  }}
                  onBlur={() => setSearchPageInput(String(searchPage))}
                  className="w-12 text-center bg-transparent border border-transparent focus:border-border focus:outline-none rounded px-1"
                />
                of {searchTotalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setSearchPage(searchPage + 1)}
                disabled={searchPage >= searchTotalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handlePrevPage}
                disabled={currentPage <= 1 || isLoadingMessages || isLoadingMore}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 flex items-center gap-1">
                Page
                <input
                  type="text"
                  inputMode="numeric"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const page = parseInt(pageInput)
                      if (!isNaN(page) && page >= 1 && page <= totalPages) {
                        handleJumpToPage(page)
                      } else {
                        setPageInput(String(currentPage))
                      }
                    }
                  }}
                  onBlur={() => setPageInput(String(currentPage))}
                  className="w-12 text-center bg-transparent border border-transparent focus:border-border focus:outline-none rounded px-1"
                  disabled={isLoadingMessages || isLoadingMore}
                />
                of {totalPages}
                {(isLoadingMessages || isLoadingMore) && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleNextPage}
                disabled={currentPage >= totalPages || isLoadingMessages || isLoadingMore}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
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
