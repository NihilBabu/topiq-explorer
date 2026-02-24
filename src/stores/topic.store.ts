import { create } from 'zustand'
import { useConnectionStore } from './connection.store'
import type { TopicMetadata, ConfigEntry, KafkaMessage, TopicConfig, MessageOptions, ProduceMessage, SearchMessageOptions } from '../types/kafka.types'

interface MessageToRepublish {
  key?: string
  value: string
  headers?: Record<string, string>
  partition?: number
}

// Track request IDs to prevent stale data from race conditions
let messageRequestId = 0
let searchRequestCounter = 0
// Track in-flight requests to prevent duplicates
const inFlightRequests = new Map<string, Promise<void>>()
// Maximum number of search results to keep in memory
const MAX_SEARCH_RESULTS = 10_000

interface TopicState {
  topics: string[]
  selectedTopic: string | null
  topicMetadata: TopicMetadata | null
  topicConfig: ConfigEntry[]
  messages: KafkaMessage[]
  messageToRepublish: MessageToRepublish | null
  isLoading: boolean // Kept for backward compatibility
  isLoadingTopics: boolean
  isLoadingMetadata: boolean
  isLoadingConfig: boolean
  isLoadingMessages: boolean
  error: string | null
  messageError: string | null
  lastMessageOptions: MessageOptions | null
  hasMore: boolean
  nextOffset: string | null
  nextPartition: number | undefined
  isLoadingMore: boolean

  // Server-side search state
  isSearchActive: boolean
  isSearching: boolean
  searchQuery: string
  searchResults: KafkaMessage[]
  searchScanned: number
  searchTotalMatches: number
  searchHasMore: boolean
  searchNextOffset: string | null
  searchNextPartition: number | undefined
  searchRequestId: string | null
  searchError: string | null

  // Actions
  loadTopics: (connectionId: string) => Promise<void>
  selectTopic: (topic: string | null) => void
  loadTopicMetadata: (connectionId: string, topic: string) => Promise<void>
  loadTopicConfig: (connectionId: string, topic: string) => Promise<void>
  createTopic: (connectionId: string, config: TopicConfig) => Promise<void>
  deleteTopic: (connectionId: string, topic: string) => Promise<void>
  loadMessages: (connectionId: string, topic: string, options?: MessageOptions) => Promise<void>
  loadMoreMessages: (connectionId: string, topic: string) => Promise<void>
  produceMessage: (connectionId: string, topic: string, message: ProduceMessage) => Promise<void>
  setMessageToRepublish: (message: MessageToRepublish | null) => void
  clearMessages: () => void
  searchMessages: (connectionId: string, topic: string, query: string, partition?: number) => Promise<void>
  searchMoreMessages: (connectionId: string, topic: string) => Promise<void>
  clearSearch: () => void
  cancelSearch: (connectionId: string) => Promise<void>
  reset: () => void
}

export const useTopicStore = create<TopicState>((set) => ({
  topics: [],
  selectedTopic: null,
  topicMetadata: null,
  topicConfig: [],
  messages: [],
  messageToRepublish: null,
  isLoading: false,
  isLoadingTopics: false,
  isLoadingMetadata: false,
  isLoadingConfig: false,
  isLoadingMessages: false,
  error: null,
  messageError: null,
  lastMessageOptions: null,
  hasMore: false,
  nextOffset: null,
  nextPartition: undefined,
  isLoadingMore: false,

  isSearchActive: false,
  isSearching: false,
  searchQuery: '',
  searchResults: [],
  searchScanned: 0,
  searchTotalMatches: 0,
  searchHasMore: false,
  searchNextOffset: null,
  searchNextPartition: undefined,
  searchRequestId: null,
  searchError: null,

  loadTopics: async (connectionId) => {
    // Deduplicate in-flight requests
    const requestKey = `loadTopics:${connectionId}`
    const existingRequest = inFlightRequests.get(requestKey)
    if (existingRequest) return existingRequest

    const doLoad = async () => {
      set({ isLoadingTopics: true, isLoading: true, error: null })
      try {
        const result = await window.api.kafka.getTopics(connectionId) as unknown
        // Handle standardized IPC response
        let topics: string[]
        if (result && typeof result === 'object' && 'success' in result) {
          const typedResult = result as { success: boolean; data?: string[]; error?: string }
          if (!typedResult.success) {
            throw new Error(typedResult.error || 'Failed to load topics')
          }
          topics = typedResult.data ?? []
        } else {
          topics = result as string[]
        }
        set({ topics: topics.sort(), isLoadingTopics: false, isLoading: false })
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to load topics', isLoadingTopics: false, isLoading: false })
      } finally {
        inFlightRequests.delete(requestKey)
      }
    }

    const promise = doLoad()
    inFlightRequests.set(requestKey, promise)
    return promise
  },

  selectTopic: (topic) => {
    set({
      selectedTopic: topic, topicMetadata: null, topicConfig: [], messages: [], hasMore: false, nextOffset: null, nextPartition: undefined, messageError: null,
      isSearchActive: false, isSearching: false, searchQuery: '', searchResults: [], searchScanned: 0, searchTotalMatches: 0, searchHasMore: false, searchNextOffset: null, searchNextPartition: undefined, searchRequestId: null, searchError: null
    })
  },

  loadTopicMetadata: async (connectionId, topic) => {
    set({ isLoadingMetadata: true, error: null })
    try {
      const result = await window.api.kafka.getTopicMetadata(connectionId, topic) as unknown
      // Handle standardized IPC response
      let metadata: TopicMetadata
      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; data?: TopicMetadata; error?: string }
        if (!typedResult.success) {
          throw new Error(typedResult.error || 'Failed to load topic metadata')
        }
        metadata = typedResult.data!
      } else {
        metadata = result as TopicMetadata
      }
      set({ topicMetadata: metadata, isLoadingMetadata: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load topic metadata', isLoadingMetadata: false })
    }
  },

  loadTopicConfig: async (connectionId, topic) => {
    set({ isLoadingConfig: true, error: null })
    try {
      const result = await window.api.kafka.getTopicConfig(connectionId, topic) as unknown
      // Handle standardized IPC response
      let config: ConfigEntry[]
      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; data?: ConfigEntry[]; error?: string }
        if (!typedResult.success) {
          throw new Error(typedResult.error || 'Failed to load topic config')
        }
        config = typedResult.data ?? []
      } else {
        config = result as ConfigEntry[]
      }
      set({ topicConfig: config, isLoadingConfig: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load topic config', isLoadingConfig: false })
    }
  },

  createTopic: async (connectionId, config) => {
    set({ isLoadingTopics: true, isLoading: true, error: null })
    try {
      const createResult = await window.api.kafka.createTopic(connectionId, config) as unknown
      // Handle standardized IPC response
      if (createResult && typeof createResult === 'object' && 'success' in createResult) {
        const typedResult = createResult as { success: boolean; error?: string }
        if (!typedResult.success) {
          throw new Error(typedResult.error || 'Failed to create topic')
        }
      }
      const topicsResult = await window.api.kafka.getTopics(connectionId) as unknown
      let topics: string[]
      if (topicsResult && typeof topicsResult === 'object' && 'success' in topicsResult) {
        const typedResult = topicsResult as { success: boolean; data?: string[]; error?: string }
        if (!typedResult.success) {
          throw new Error(typedResult.error || 'Failed to load topics')
        }
        topics = typedResult.data ?? []
      } else {
        topics = topicsResult as string[]
      }
      set({ topics: topics.sort(), isLoadingTopics: false, isLoading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to create topic', isLoadingTopics: false, isLoading: false })
      throw error
    }
  },

  deleteTopic: async (connectionId, topic) => {
    set({ isLoadingTopics: true, isLoading: true, error: null })
    try {
      const result = await window.api.kafka.deleteTopic(connectionId, topic) as unknown
      // Handle standardized IPC response
      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; error?: string }
        if (!typedResult.success) {
          throw new Error(typedResult.error || 'Failed to delete topic')
        }
      }
      set((state) => ({
        topics: state.topics.filter((t) => t !== topic),
        selectedTopic: state.selectedTopic === topic ? null : state.selectedTopic,
        isLoadingTopics: false,
        isLoading: false
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to delete topic', isLoadingTopics: false, isLoading: false })
      throw error
    }
  },

  loadMessages: async (connectionId, topic, options) => {
    // Deduplicate in-flight requests
    const requestKey = `loadMessages:${connectionId}:${topic}`
    const existingRequest = inFlightRequests.get(requestKey)
    if (existingRequest) return existingRequest

    const doLoad = async () => {
      // Track this request to prevent stale data from race conditions
      const currentRequestId = ++messageRequestId
      set({ isLoadingMessages: true, error: null, messageError: null, lastMessageOptions: options ?? null, hasMore: false, nextOffset: null, nextPartition: undefined })
      try {
        const result = await window.api.kafka.getMessages(connectionId, topic, options) as unknown
        // Discard stale response if a newer request was made
        if (currentRequestId !== messageRequestId) return
        // Handle structured response format from IPC handler
        if (result && typeof result === 'object' && 'success' in result) {
          const typedResult = result as { success: boolean; error?: string; data?: { messages: KafkaMessage[]; hasMore?: boolean; nextOffset?: string | null; nextPartition?: number } }
          if (!typedResult.success) {
            throw new Error(typedResult.error || 'Failed to load messages')
          }
          const data = typedResult.data
          const messages = data?.messages ?? []
          set({ messages, isLoadingMessages: false, hasMore: data?.hasMore ?? false, nextOffset: data?.nextOffset ?? null, nextPartition: data?.nextPartition })
        } else if (Array.isArray(result)) {
          // Legacy format: direct array
          set({ messages: result as KafkaMessage[], isLoadingMessages: false, hasMore: false, nextOffset: null, nextPartition: undefined })
        } else {
          // Fallback for other formats
          const typedResult = result as { messages?: KafkaMessage[]; hasMore?: boolean; nextOffset?: string | null; nextPartition?: number }
          const messages = typedResult?.messages ?? []
          set({ messages, isLoadingMessages: false, hasMore: typedResult?.hasMore ?? false, nextOffset: typedResult?.nextOffset ?? null, nextPartition: typedResult?.nextPartition })
        }
      } catch (error) {
        // Discard stale error if a newer request was made
        if (currentRequestId !== messageRequestId) return
        const errorMsg = error instanceof Error ? error.message : 'Failed to load messages'
        set({ error: errorMsg, messageError: errorMsg, isLoadingMessages: false })
      } finally {
        inFlightRequests.delete(requestKey)
      }
    }

    const promise = doLoad()
    inFlightRequests.set(requestKey, promise)
    return promise
  },

  loadMoreMessages: async (connectionId, topic) => {
    const state = useTopicStore.getState()
    if (!state.hasMore || !state.nextOffset || state.isLoadingMore) return

    set({ isLoadingMore: true })
    try {
      const options: MessageOptions = {
        ...state.lastMessageOptions,
        fromOffset: state.nextOffset,
        partition: state.nextPartition
      }
      const result = await window.api.kafka.getMessages(connectionId, topic, options) as unknown

      let newMessages: KafkaMessage[] = []
      let hasMore = false
      let nextOffset: string | null = null
      let nextPartition: number | undefined

      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; error?: string; data?: { messages: KafkaMessage[]; hasMore?: boolean; nextOffset?: string | null; nextPartition?: number } }
        if (!typedResult.success) {
          throw new Error(typedResult.error || 'Failed to load more messages')
        }
        const data = typedResult.data
        newMessages = data?.messages ?? []
        hasMore = data?.hasMore ?? false
        nextOffset = data?.nextOffset ?? null
        nextPartition = data?.nextPartition
      } else if (Array.isArray(result)) {
        newMessages = result as KafkaMessage[]
      } else {
        const typedResult = result as { messages?: KafkaMessage[]; hasMore?: boolean; nextOffset?: string | null; nextPartition?: number }
        newMessages = typedResult?.messages ?? []
        hasMore = typedResult?.hasMore ?? false
        nextOffset = typedResult?.nextOffset ?? null
        nextPartition = typedResult?.nextPartition
      }

      set({ messages: [...state.messages, ...newMessages], hasMore, nextOffset, nextPartition, isLoadingMore: false })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to load more messages'
      set({ messageError: errorMsg, isLoadingMore: false })
    }
  },

  produceMessage: async (connectionId, topic, message) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.kafka.produceMessage(connectionId, topic, message) as unknown
      // Handle standardized IPC response
      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; error?: string }
        if (!typedResult.success) {
          throw new Error(typedResult.error || 'Failed to produce message')
        }
      }
      set({ isLoading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to produce message', isLoading: false })
      throw error
    }
  },

  setMessageToRepublish: (message) => {
    set({ messageToRepublish: message })
  },

  searchMessages: async (connectionId, topic, query, partition?) => {
    // Cancel any active search
    const state = useTopicStore.getState()
    if (state.searchRequestId) {
      try {
        const result = await window.api.kafka.cancelSearch(connectionId, state.searchRequestId) as unknown
        if (result && typeof result === 'object' && 'success' in result) {
          // ignore cancel result
        }
      } catch {
        // Ignore cancel errors
      }
    }

    const currentRequestId = `search-${++searchRequestCounter}`
    set({
      isSearchActive: true,
      isSearching: true,
      searchQuery: query,
      searchResults: [],
      searchScanned: 0,
      searchTotalMatches: 0,
      searchHasMore: false,
      searchNextOffset: null,
      searchNextPartition: undefined,
      searchRequestId: currentRequestId,
      searchError: null
    })

    try {
      const options: SearchMessageOptions = {
        query,
        partition,
        requestId: currentRequestId
      }
      const result = await window.api.kafka.searchMessages(connectionId, topic, options) as unknown

      // Stale-response detection
      if (useTopicStore.getState().searchRequestId !== currentRequestId) return

      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; error?: string; data?: { matches: KafkaMessage[]; scanned: number; totalMatches: number; hasMore: boolean; nextOffset: string | null; nextPartition?: number; cancelled: boolean } }
        if (!typedResult.success) {
          throw new Error(typedResult.error || 'Search failed')
        }
        const data = typedResult.data!
        set({
          searchResults: data.matches,
          searchScanned: data.scanned,
          searchTotalMatches: data.totalMatches,
          searchHasMore: data.hasMore,
          searchNextOffset: data.nextOffset,
          searchNextPartition: data.nextPartition,
          isSearching: false
        })
      }
    } catch (error) {
      if (useTopicStore.getState().searchRequestId !== currentRequestId) return
      set({
        searchError: error instanceof Error ? error.message : 'Search failed',
        isSearching: false
      })
    }
  },

  searchMoreMessages: async (connectionId, topic) => {
    const state = useTopicStore.getState()
    if (!state.searchHasMore || !state.searchNextOffset || state.isSearching) return

    const currentRequestId = `search-${++searchRequestCounter}`
    set({ isSearching: true, searchRequestId: currentRequestId })

    try {
      const options: SearchMessageOptions = {
        query: state.searchQuery,
        partition: state.searchNextPartition,
        fromOffset: state.searchNextOffset,
        fromPartition: state.searchNextPartition,
        requestId: currentRequestId
      }
      const result = await window.api.kafka.searchMessages(connectionId, topic, options) as unknown

      if (useTopicStore.getState().searchRequestId !== currentRequestId) return

      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; error?: string; data?: { matches: KafkaMessage[]; scanned: number; totalMatches: number; hasMore: boolean; nextOffset: string | null; nextPartition?: number; cancelled: boolean } }
        if (!typedResult.success) {
          throw new Error(typedResult.error || 'Search failed')
        }
        const data = typedResult.data!
        let combined = [...state.searchResults, ...data.matches]
        // Cap search results to prevent unbounded memory growth
        if (combined.length > MAX_SEARCH_RESULTS) {
          combined = combined.slice(combined.length - MAX_SEARCH_RESULTS)
        }
        set({
          searchResults: combined,
          searchScanned: state.searchScanned + data.scanned,
          searchTotalMatches: combined.length,
          searchHasMore: data.hasMore,
          searchNextOffset: data.nextOffset,
          searchNextPartition: data.nextPartition,
          isSearching: false
        })
      }
    } catch (error) {
      if (useTopicStore.getState().searchRequestId !== currentRequestId) return
      set({
        searchError: error instanceof Error ? error.message : 'Search failed',
        isSearching: false
      })
    }
  },

  clearSearch: () => {
    set({
      isSearchActive: false,
      isSearching: false,
      searchQuery: '',
      searchResults: [],
      searchScanned: 0,
      searchTotalMatches: 0,
      searchHasMore: false,
      searchNextOffset: null,
      searchNextPartition: undefined,
      searchRequestId: null,
      searchError: null
    })
  },

  cancelSearch: async (connectionId) => {
    const state = useTopicStore.getState()
    if (state.searchRequestId) {
      try {
        const result = await window.api.kafka.cancelSearch(connectionId, state.searchRequestId) as unknown
        if (result && typeof result === 'object' && 'success' in result) {
          // ignore
        }
      } catch {
        // Ignore cancel errors
      }
    }
    set({ isSearching: false })
  },

  clearMessages: () => {
    set({ messages: [] })
  },

  reset: () => {
    set({
      topics: [],
      selectedTopic: null,
      topicMetadata: null,
      topicConfig: [],
      messages: [],
      messageToRepublish: null,
      isLoading: false,
      isLoadingTopics: false,
      isLoadingMetadata: false,
      isLoadingConfig: false,
      isLoadingMessages: false,
      error: null,
      messageError: null,
      lastMessageOptions: null,
      hasMore: false,
      nextOffset: null,
      nextPartition: undefined,
      isLoadingMore: false,
      isSearchActive: false,
      isSearching: false,
      searchQuery: '',
      searchResults: [],
      searchScanned: 0,
      searchTotalMatches: 0,
      searchHasMore: false,
      searchNextOffset: null,
      searchNextPartition: undefined,
      searchRequestId: null,
      searchError: null
    })
  }
}))

// Reset topic store when active connection changes to prevent stale data from previous cluster
let _prevConnectionId: string | null = useConnectionStore.getState().activeConnectionId
useConnectionStore.subscribe((state) => {
  if (state.activeConnectionId !== _prevConnectionId) {
    _prevConnectionId = state.activeConnectionId
    useTopicStore.getState().reset()
  }
})
