// Re-export all types from the shared types file (single source of truth)
export type {
  TLSConfig,
  KafkaConnection,
  TopicMetadata,
  PartitionMetadata,
  TopicConfig,
  ConfigEntry,
  KafkaMessage,
  MessageOptions,
  ProduceMessage,
  ConsumerGroup,
  ConsumerGroupDetails,
  ConsumerMember,
  PartitionOffset,
  ResetOffsetOptions,
  ConnectionStatus,
  UpdateChannel,
  UpdateCheckResult,
  DownloadProgress,
  IpcSuccessResponse,
  IpcErrorResponse,
  IpcResponse
} from '../../shared/types'
