import { create } from 'zustand'
import type { ConsumerGroup, ConsumerGroupDetails, ResetOffsetOptions } from '../types/kafka.types'

interface ConsumerState {
  consumerGroups: ConsumerGroup[]
  selectedGroupId: string | null
  groupDetails: ConsumerGroupDetails | null
  isLoading: boolean
  error: string | null

  // Actions
  loadConsumerGroups: (connectionId: string) => Promise<void>
  selectGroup: (groupId: string | null) => void
  loadGroupDetails: (connectionId: string, groupId: string) => Promise<void>
  deleteGroup: (connectionId: string, groupId: string) => Promise<void>
  resetOffsets: (connectionId: string, groupId: string, topic: string, options: ResetOffsetOptions) => Promise<void>
  reset: () => void
}

export const useConsumerStore = create<ConsumerState>((set) => ({
  consumerGroups: [],
  selectedGroupId: null,
  groupDetails: null,
  isLoading: false,
  error: null,

  loadConsumerGroups: async (connectionId) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.kafka.getConsumerGroups(connectionId) as unknown
      // Handle standardized IPC response
      let groups: ConsumerGroup[]
      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; data?: ConsumerGroup[]; error?: string }
        if (!typedResult.success) {
          throw new Error(typedResult.error || 'Failed to load consumer groups')
        }
        groups = typedResult.data ?? []
      } else {
        groups = result as ConsumerGroup[]
      }
      set({ consumerGroups: groups.sort((a: ConsumerGroup, b: ConsumerGroup) => a.groupId.localeCompare(b.groupId)), isLoading: false })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load consumer groups', isLoading: false })
    }
  },

  selectGroup: (groupId) => {
    set({ selectedGroupId: groupId, groupDetails: null })
  },

  loadGroupDetails: async (connectionId, groupId) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.kafka.getConsumerGroupDetails(connectionId, groupId)
      // Handle structured response format from IPC handler
      if (result && typeof result === 'object' && 'success' in result) {
        if (!result.success) {
          throw new Error(result.error || 'Failed to load group details')
        }
        set({ groupDetails: result.data, isLoading: false })
      } else {
        // Fallback for direct response
        set({ groupDetails: result, isLoading: false })
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load group details', isLoading: false })
    }
  },

  deleteGroup: async (connectionId, groupId) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.kafka.deleteConsumerGroup(connectionId, groupId) as unknown
      // Handle standardized IPC response
      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; error?: string }
        if (!typedResult.success) {
          throw new Error(typedResult.error || 'Failed to delete consumer group')
        }
      }
      set((state) => ({
        consumerGroups: state.consumerGroups.filter((g) => g.groupId !== groupId),
        selectedGroupId: state.selectedGroupId === groupId ? null : state.selectedGroupId,
        groupDetails: state.selectedGroupId === groupId ? null : state.groupDetails,
        isLoading: false
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to delete consumer group', isLoading: false })
      throw error
    }
  },

  resetOffsets: async (connectionId, groupId, topic, options) => {
    set({ isLoading: true, error: null })
    try {
      const resetResult = await window.api.kafka.resetOffsets(connectionId, groupId, topic, options) as unknown
      // Handle standardized IPC response
      if (resetResult && typeof resetResult === 'object' && 'success' in resetResult) {
        const typedResult = resetResult as { success: boolean; error?: string }
        if (!typedResult.success) {
          throw new Error(typedResult.error || 'Failed to reset offsets')
        }
      }
      // Reload group details after resetting offsets
      const result = await window.api.kafka.getConsumerGroupDetails(connectionId, groupId)
      // Handle structured response format from IPC handler
      if (result && typeof result === 'object' && 'success' in result) {
        if (!result.success) {
          throw new Error(result.error || 'Failed to load group details')
        }
        set({ groupDetails: result.data, isLoading: false })
      } else {
        set({ groupDetails: result, isLoading: false })
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to reset offsets', isLoading: false })
      throw error
    }
  },

  reset: () => {
    set({
      consumerGroups: [],
      selectedGroupId: null,
      groupDetails: null,
      isLoading: false,
      error: null
    })
  }
}))
