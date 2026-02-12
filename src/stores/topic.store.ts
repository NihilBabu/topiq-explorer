import { create } from 'zustand'
import type { TopicMetadata, ConfigEntry, KafkaMessage, TopicConfig, MessageOptions, ProduceMessage } from '../types/kafka.types'

interface MessageToRepublish {
  key?: string
  value: string
  headers?: Record<string, string>
  partition?: number
}

// Track request IDs to prevent stale data from race conditions
let messageRequestId = 0
// Track in-flight requests to prevent duplicates
const inFlightRequests = new Map<string, Promise<void>>()

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

  // Actions
  loadTopics: (connectionId: string) => Promise<void>
  selectTopic: (topic: string | null) => void
  loadTopicMetadata: (connectionId: string, topic: string) => Promise<void>
  loadTopicConfig: (connectionId: string, topic: string) => Promise<void>
  createTopic: (connectionId: string, config: TopicConfig) => Promise<void>
  deleteTopic: (connectionId: string, topic: string) => Promise<void>
  loadMessages: (connectionId: string, topic: string, options?: MessageOptions) => Promise<void>
  produceMessage: (connectionId: string, topic: string, message: ProduceMessage) => Promise<void>
  setMessageToRepublish: (message: MessageToRepublish | null) => void
  clearMessages: () => void
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
    set({ selectedTopic: topic, topicMetadata: null, topicConfig: [], messages: [] })
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
    // Track this request to prevent stale data from race conditions
    const currentRequestId = ++messageRequestId
    set({ isLoadingMessages: true, error: null })
    try {
      const result = await window.api.kafka.getMessages(connectionId, topic, options) as unknown
      // Discard stale response if a newer request was made
      if (currentRequestId !== messageRequestId) return
      // Handle structured response format from IPC handler
      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; error?: string; data?: { messages: KafkaMessage[] } }
        if (!typedResult.success) {
          throw new Error(typedResult.error || 'Failed to load messages')
        }
        // New format: { success: true, data: { messages, hasMore, nextOffset } }
        const messages = typedResult.data?.messages ?? []
        set({ messages, isLoadingMessages: false })
      } else if (Array.isArray(result)) {
        // Legacy format: direct array
        set({ messages: result as KafkaMessage[], isLoadingMessages: false })
      } else {
        // Fallback for other formats
        const typedResult = result as { messages?: KafkaMessage[] }
        const messages = typedResult?.messages ?? []
        set({ messages, isLoadingMessages: false })
      }
    } catch (error) {
      // Discard stale error if a newer request was made
      if (currentRequestId !== messageRequestId) return
      set({ error: error instanceof Error ? error.message : 'Failed to load messages', isLoadingMessages: false })
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
      error: null
    })
  }
}))
