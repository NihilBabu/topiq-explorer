// Shared types between Electron main process, preload, and renderer
// Single source of truth for all Kafka-related type definitions

export interface TLSConfig {
  ca?: string              // PEM-encoded CA cert(s)
  cert?: string            // PEM-encoded client cert
  key?: string             // PEM-encoded client private key
  passphrase?: string      // For encrypted keys
  rejectUnauthorized?: boolean  // Default true; false for self-signed
}

export interface KafkaConnection {
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

export interface TopicMetadata {
  name: string
  partitions: PartitionMetadata[]
}

export interface PartitionMetadata {
  partition: number
  leader: number
  replicas: number[]
  isr: number[]
  offset: string
  high: string
  low: string
}

export interface TopicConfig {
  name: string
  numPartitions: number
  replicationFactor: number
  configEntries?: Record<string, string>
}

export interface ConfigEntry {
  configName: string
  configValue: string
  readOnly: boolean
  isDefault: boolean
  configSource: number
  isSensitive: boolean
}

export interface KafkaMessage {
  partition: number
  offset: string
  timestamp: string
  key: string | null
  value: string | null
  headers: Record<string, string>
}

export interface MessageOptions {
  partition?: number
  fromOffset?: string
  fromTimestamp?: number
  limit?: number
}

export interface ProduceMessage {
  key?: string
  value: string | null
  headers?: Record<string, string>
  partition?: number
}

export interface ConsumerGroup {
  groupId: string
  protocolType: string
}

export interface ConsumerGroupDetails {
  groupId: string
  state: string
  protocolType: string
  protocol: string
  members: ConsumerMember[]
  offsets: Record<string, PartitionOffset[]>
}

export interface ConsumerMember {
  memberId: string
  clientId: string
  clientHost: string
}

export interface PartitionOffset {
  partition: number
  offset: string
  lag: number | null
}

export interface ResetOffsetOptions {
  type: 'earliest' | 'latest' | 'timestamp' | 'offset'
  timestamp?: number
  offset?: string
  partitions?: number[]
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type UpdateChannel = 'stable' | 'beta' | 'alpha'

export interface UpdateCheckResult {
  updateAvailable: boolean
  version: string
  releaseNotes?: string
  releaseDate?: string
}

export interface DownloadProgress {
  bytesPerSecond: number
  percent: number
  transferred: number
  total: number
}

// Standardized IPC response format
export interface IpcSuccessResponse<T> {
  success: true
  data: T
}

export interface IpcErrorResponse {
  success: false
  error: string
}

export type IpcResponse<T> = IpcSuccessResponse<T> | IpcErrorResponse
