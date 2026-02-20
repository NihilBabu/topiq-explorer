interface TLSConfig {
  ca?: string
  cert?: string
  key?: string
  passphrase?: string
  rejectUnauthorized?: boolean
}

interface KafkaConnection {
  id: string
  name: string
  brokers: string[]
  ssl?: boolean | TLSConfig
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512'
    username: string
    password: string
  }
  schemaRegistry?: {
    url: string
    username?: string
    password?: string
  }
  color?: string
  createdAt: number
  updatedAt: number
}

interface TopicConfig {
  name: string
  numPartitions: number
  replicationFactor: number
  configEntries?: Record<string, string>
}

interface MessageOptions {
  partition?: number
  fromOffset?: string
  fromTimestamp?: number
  limit?: number
}

interface ProduceMessage {
  key?: string
  value: string | null
  headers?: Record<string, string>
  partition?: number
}

interface ResetOffsetOptions {
  type: 'earliest' | 'latest' | 'timestamp' | 'offset'
  timestamp?: number
  offset?: string
  partitions?: number[]
}

type UpdateChannel = 'stable' | 'beta' | 'alpha'

interface UpdateCheckResult {
  updateAvailable: boolean
  version: string
  releaseNotes?: string
  releaseDate?: string
}

interface DownloadProgress {
  bytesPerSecond: number
  percent: number
  transferred: number
  total: number
}

interface UpdaterApi {
  checkForUpdates: () => Promise<UpdateCheckResult>
  downloadUpdate: () => Promise<{ success: boolean }>
  installUpdate: () => Promise<void>
  getVersion: () => Promise<string>
  getChannel: () => Promise<UpdateChannel>
  setChannel: (channel: UpdateChannel) => Promise<UpdateChannel>
  onCheckingForUpdate: (callback: () => void) => () => void
  onUpdateAvailable: (callback: (info: UpdateCheckResult) => void) => () => void
  onUpdateNotAvailable: (callback: () => void) => () => void
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void
  onUpdateDownloaded: (callback: (info: UpdateCheckResult) => void) => () => void
  onError: (callback: (error: string) => void) => () => void
}

interface WindowApi {
  connections: {
    getAll: () => Promise<KafkaConnection[]>
    get: (id: string) => Promise<KafkaConnection | undefined>
    save: (connection: Omit<KafkaConnection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<KafkaConnection>
    delete: (id: string) => Promise<void>
    test: (connection: Omit<KafkaConnection, 'id' | 'createdAt' | 'updatedAt'>) => Promise<{ success: boolean; error?: string }>
    pickCertFile: () => Promise<{ success: true; data: { filename: string; content: string } | null } | { success: false; error: string }>
  }
  kafka: {
    connect: (connectionId: string) => Promise<void>
    disconnect: (connectionId: string) => Promise<void>
    getClusterInfo: (connectionId: string) => Promise<any>
    getTopics: (connectionId: string) => Promise<string[]>
    getTopicMetadata: (connectionId: string, topic: string) => Promise<any>
    getTopicConfig: (connectionId: string, topic: string) => Promise<any>
    getBrokerConfig: (connectionId: string) => Promise<any>
    createTopic: (connectionId: string, config: TopicConfig) => Promise<void>
    deleteTopic: (connectionId: string, topic: string) => Promise<void>
    getMessages: (connectionId: string, topic: string, options?: MessageOptions) => Promise<any[]>
    produceMessage: (connectionId: string, topic: string, message: ProduceMessage) => Promise<void>
    getConsumerGroups: (connectionId: string) => Promise<any[]>
    getConsumerGroupDetails: (connectionId: string, groupId: string) => Promise<any>
    deleteConsumerGroup: (connectionId: string, groupId: string) => Promise<void>
    resetOffsets: (connectionId: string, groupId: string, topic: string, options: ResetOffsetOptions) => Promise<void>
    deleteRecords: (connectionId: string, topic: string, partitionOffsets: { partition: number; offset: string }[]) => Promise<void>
  }
  updater: UpdaterApi
}

declare global {
  interface Window {
    api: WindowApi
  }
}

export {}
