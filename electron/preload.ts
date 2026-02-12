import { contextBridge, ipcRenderer } from 'electron'
import type {
  KafkaConnection,
  TopicConfig,
  MessageOptions,
  ProduceMessage,
  ResetOffsetOptions,
  UpdateChannel,
  UpdateCheckResult,
  DownloadProgress
} from '../shared/types'

// Re-export types for consumers of preload
export type {
  KafkaConnection,
  TopicConfig,
  MessageOptions,
  ProduceMessage,
  ResetOffsetOptions,
  UpdateChannel,
  UpdateCheckResult,
  DownloadProgress
}

const api = {
  // Connection operations
  connections: {
    getAll: (): Promise<KafkaConnection[]> => ipcRenderer.invoke('connections:getAll'),
    get: (id: string): Promise<KafkaConnection | undefined> => ipcRenderer.invoke('connections:get', id),
    save: (connection: Omit<KafkaConnection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<KafkaConnection> =>
      ipcRenderer.invoke('connections:save', connection),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('connections:delete', id),
    test: (connection: Omit<KafkaConnection, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('connections:test', connection),
    pickCertFile: () => ipcRenderer.invoke('connections:pickCertFile')
  },

  // Kafka operations
  kafka: {
    connect: (connectionId: string): Promise<void> => ipcRenderer.invoke('kafka:connect', connectionId),
    disconnect: (connectionId: string): Promise<void> => ipcRenderer.invoke('kafka:disconnect', connectionId),

    // Topics
    getTopics: (connectionId: string): Promise<string[]> => ipcRenderer.invoke('kafka:getTopics', connectionId),
    getTopicMetadata: (connectionId: string, topic: string) => ipcRenderer.invoke('kafka:getTopicMetadata', connectionId, topic),
    getTopicConfig: (connectionId: string, topic: string) => ipcRenderer.invoke('kafka:getTopicConfig', connectionId, topic),
    createTopic: (connectionId: string, config: TopicConfig) => ipcRenderer.invoke('kafka:createTopic', connectionId, config),
    deleteTopic: (connectionId: string, topic: string) => ipcRenderer.invoke('kafka:deleteTopic', connectionId, topic),

    // Messages
    getMessages: (connectionId: string, topic: string, options?: MessageOptions) =>
      ipcRenderer.invoke('kafka:getMessages', connectionId, topic, options),
    produceMessage: (connectionId: string, topic: string, message: ProduceMessage) =>
      ipcRenderer.invoke('kafka:produceMessage', connectionId, topic, message),

    // Consumer Groups
    getConsumerGroups: (connectionId: string) => ipcRenderer.invoke('kafka:getConsumerGroups', connectionId),
    getConsumerGroupDetails: (connectionId: string, groupId: string) =>
      ipcRenderer.invoke('kafka:getConsumerGroupDetails', connectionId, groupId),
    deleteConsumerGroup: (connectionId: string, groupId: string) =>
      ipcRenderer.invoke('kafka:deleteConsumerGroup', connectionId, groupId),
    resetOffsets: (connectionId: string, groupId: string, topic: string, options: ResetOffsetOptions) =>
      ipcRenderer.invoke('kafka:resetOffsets', connectionId, groupId, topic, options),
    deleteRecords: (connectionId: string, topic: string, partitionOffsets: { partition: number; offset: string }[]) =>
      ipcRenderer.invoke('kafka:deleteRecords', connectionId, topic, partitionOffsets)
  },

  // Updater operations
  updater: {
    checkForUpdates: (): Promise<UpdateCheckResult> => ipcRenderer.invoke('updater:checkForUpdates'),
    downloadUpdate: (): Promise<{ success: boolean }> => ipcRenderer.invoke('updater:downloadUpdate'),
    installUpdate: (): Promise<void> => ipcRenderer.invoke('updater:installUpdate'),
    getVersion: (): Promise<string> => ipcRenderer.invoke('updater:getVersion'),
    getChannel: (): Promise<UpdateChannel> => ipcRenderer.invoke('updater:getChannel'),
    setChannel: (channel: UpdateChannel): Promise<UpdateChannel> => ipcRenderer.invoke('updater:setChannel', channel),

    // Event listeners
    onCheckingForUpdate: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('updater:checking-for-update', handler)
      return () => ipcRenderer.removeListener('updater:checking-for-update', handler)
    },
    onUpdateAvailable: (callback: (info: UpdateCheckResult) => void) => {
      const handler = (_: unknown, info: UpdateCheckResult) => callback(info)
      ipcRenderer.on('updater:update-available', handler)
      return () => ipcRenderer.removeListener('updater:update-available', handler)
    },
    onUpdateNotAvailable: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('updater:update-not-available', handler)
      return () => ipcRenderer.removeListener('updater:update-not-available', handler)
    },
    onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
      const handler = (_: unknown, progress: DownloadProgress) => callback(progress)
      ipcRenderer.on('updater:download-progress', handler)
      return () => ipcRenderer.removeListener('updater:download-progress', handler)
    },
    onUpdateDownloaded: (callback: (info: UpdateCheckResult) => void) => {
      const handler = (_: unknown, info: UpdateCheckResult) => callback(info)
      ipcRenderer.on('updater:update-downloaded', handler)
      return () => ipcRenderer.removeListener('updater:update-downloaded', handler)
    },
    onError: (callback: (error: string) => void) => {
      const handler = (_: unknown, error: string) => callback(error)
      ipcRenderer.on('updater:error', handler)
      return () => ipcRenderer.removeListener('updater:error', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: typeof api
  }
}
