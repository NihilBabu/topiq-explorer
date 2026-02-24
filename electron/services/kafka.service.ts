import { Kafka, Admin, Producer, Consumer, logLevel, SASLOptions, Partitioners } from 'kafkajs'
import { randomUUID } from 'crypto'
import * as tls from 'tls'
import type {
  KafkaConnection,
  TLSConfig,
  TopicConfig,
  MessageOptions,
  ProduceMessage,
  ResetOffsetOptions,
  SearchMessageOptions,
  SearchMessageResult
} from '../../shared/types'

// Large message protection: truncate oversized payloads before sending to renderer
const MAX_VALUE_SIZE = 1_048_576  // 1MB
const MAX_KEY_SIZE = 10_240       // 10KB
const MAX_HEADER_VALUE_SIZE = 10_240  // 10KB

const truncate = (s: string | null | undefined, max: number): string | null => {
  if (s == null) return null
  return s.length > max ? s.slice(0, max) + '\n...[truncated]' : s
}

interface KafkaInstance {
  kafka: Kafka
  admin: Admin
  producer: Producer
  consumers: Map<string, Consumer>
}

export class KafkaService {
  private instances: Map<string, KafkaInstance> = new Map()
  private tempConsumerGroups: Map<string, Set<string>> = new Map()
  private activeSearches: Map<string, { cancelled: boolean }> = new Map()

  private trackTempGroup(connectionId: string, groupId: string): void {
    if (!this.tempConsumerGroups.has(connectionId)) {
      this.tempConsumerGroups.set(connectionId, new Set())
    }
    this.tempConsumerGroups.get(connectionId)!.add(groupId)
  }

  private untrackTempGroup(connectionId: string, groupId: string): void {
    const groups = this.tempConsumerGroups.get(connectionId)
    if (groups) {
      groups.delete(groupId)
    }
  }

  private buildTlsOptions(tlsConfig: TLSConfig): tls.ConnectionOptions {
    const options: tls.ConnectionOptions = {}

    if (tlsConfig.ca) {
      options.ca = [tlsConfig.ca]
    }
    if (tlsConfig.cert) {
      options.cert = tlsConfig.cert
    }
    if (tlsConfig.key) {
      options.key = tlsConfig.key
    }
    if (tlsConfig.passphrase) {
      options.passphrase = tlsConfig.passphrase
    }
    if (tlsConfig.rejectUnauthorized !== undefined) {
      options.rejectUnauthorized = tlsConfig.rejectUnauthorized
    }

    return options
  }

  private createKafkaClient(connection: KafkaConnection): Kafka {
    const sasl: SASLOptions | undefined = connection.sasl
      ? {
          mechanism: connection.sasl.mechanism,
          username: connection.sasl.username,
          password: connection.sasl.password
        }
      : undefined

    let sslOption: boolean | tls.ConnectionOptions | undefined
    if (typeof connection.ssl === 'object' && connection.ssl !== null) {
      sslOption = this.buildTlsOptions(connection.ssl)
    } else {
      sslOption = connection.ssl
    }

    return new Kafka({
      clientId: `topiq-explorer-${connection.id}`,
      brokers: connection.brokers,
      ssl: sslOption,
      sasl,
      logLevel: logLevel.WARN,
      connectionTimeout: 10000,
      requestTimeout: 30000
    })
  }

  private mapTlsError(error: Error): string {
    const message = error.message || ''
    const tlsErrors: Record<string, string> = {
      'DEPTH_ZERO_SELF_SIGNED_CERT': 'The server is using a self-signed certificate. Enable "Skip certificate verification" to connect.',
      'SELF_SIGNED_CERT_IN_CHAIN': 'The certificate chain contains a self-signed certificate. Provide the CA certificate or enable "Skip certificate verification".',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE': 'Unable to verify the server certificate. Provide the correct CA certificate or enable "Skip certificate verification".',
      'CERT_HAS_EXPIRED': 'The server certificate has expired. Contact the cluster administrator.',
      'ERR_TLS_CERT_ALTNAME_INVALID': 'The server hostname does not match the certificate. Check the broker address or provide the correct certificate.',
      'UNABLE_TO_GET_ISSUER_CERT': 'Unable to find the certificate issuer. Provide the CA certificate.',
      'UNABLE_TO_GET_ISSUER_CERT_LOCALLY': 'Unable to find the certificate issuer locally. Provide the CA certificate.',
      'ERR_OSSL_EVP_BAD_DECRYPT': 'Could not decrypt the private key. Check the passphrase.',
      'ERR_OSSL_PEM_BAD_BASE64_DECODE': 'The certificate or key file is malformed. Ensure it is a valid PEM file.',
    }

    for (const [code, friendlyMessage] of Object.entries(tlsErrors)) {
      if (message.includes(code)) {
        return friendlyMessage
      }
    }

    return message
  }

  async testConnection(connection: Omit<KafkaConnection, 'id'>): Promise<{ success: boolean; error?: string }> {
    const tempConnection = { ...connection, id: 'test' }
    const kafka = this.createKafkaClient(tempConnection)
    const admin = kafka.admin()

    try {
      await admin.connect()
      await admin.listTopics()
      await admin.disconnect()
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? this.mapTlsError(error) : 'Unknown error'
      return { success: false, error: errorMessage }
    }
  }

  async connect(connection: KafkaConnection): Promise<void> {
    if (this.instances.has(connection.id)) {
      return
    }

    const kafka = this.createKafkaClient(connection)
    const admin = kafka.admin()
    const producer = kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner })

    await admin.connect()
    await producer.connect()

    this.instances.set(connection.id, {
      kafka,
      admin,
      producer,
      consumers: new Map()
    })
  }

  async disconnect(connectionId: string): Promise<void> {
    const instance = this.instances.get(connectionId)
    if (!instance) return

    const errors: Error[] = []

    // Copy consumers before clearing to prevent race with concurrent additions
    const consumersToDisconnect = new Map(instance.consumers)
    instance.consumers.clear()

    for (const consumer of consumersToDisconnect.values()) {
      try {
        await consumer.disconnect()
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)))
      }
    }

    // Clean up any tracked temporary consumer groups before disconnecting admin
    try {
      await this.cleanupTempGroups(connectionId)
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }

    // Disconnect producer
    try {
      await instance.producer.disconnect()
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }

    // Disconnect admin
    try {
      await instance.admin.disconnect()
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }

    this.instances.delete(connectionId)

    // If there were errors, log them but don't throw (cleanup completed)
    if (errors.length > 0) {
      console.warn(`Disconnect encountered ${errors.length} error(s):`, errors.map((e) => e.message))
    }
  }

  async cleanupTempGroups(connectionId: string): Promise<void> {
    const groups = this.tempConsumerGroups.get(connectionId)
    if (!groups || groups.size === 0) return

    const instance = this.instances.get(connectionId)
    if (!instance) return

    try {
      await instance.admin.deleteGroups([...groups])
    } catch {
      // Ignore errors - groups may already be deleted
    }
    groups.clear()
  }

  async deleteOrphanedGroups(connectionId: string, groupIds: string[]): Promise<void> {
    if (groupIds.length === 0) return

    const { admin } = this.getInstance(connectionId)
    try {
      await admin.deleteGroups(groupIds)
    } catch {
      // Ignore errors for non-existent groups
    }
  }

  async disconnectAll(): Promise<void> {
    const connectionIds = Array.from(this.instances.keys())
    await Promise.all(connectionIds.map((id) => this.disconnect(id)))
  }

  private getInstance(connectionId: string): KafkaInstance {
    const instance = this.instances.get(connectionId)
    if (!instance) {
      throw new Error('Not connected to this cluster')
    }
    return instance
  }

  async getClusterInfo(connectionId: string) {
    const { admin } = this.getInstance(connectionId)
    const cluster = await admin.describeCluster()

    // Try to get Kafka version from broker config
    let kafkaVersion: string | null = null
    try {
      if (cluster.brokers.length > 0) {
        const brokerConfigs = await admin.describeConfigs({
          includeSynonyms: false,
          resources: [{ type: 4, name: String(cluster.brokers[0].nodeId) }] // 4 = BROKER
        })
        const versionEntry = brokerConfigs.resources[0]?.configEntries?.find(
          (e: { configName: string }) => e.configName === 'inter.broker.protocol.version'
        )
        if (versionEntry) {
          kafkaVersion = (versionEntry as { configValue: string }).configValue
        }
      }
    } catch {
      // Some Kafka versions/configs may not support this, ignore
    }

    return {
      clusterId: cluster.clusterId,
      controller: cluster.controller,
      brokers: cluster.brokers.map((b: { nodeId: number; host: string; port: number }) => ({
        nodeId: b.nodeId,
        host: b.host,
        port: b.port
      })),
      kafkaVersion
    }
  }

  async getTopics(connectionId: string): Promise<string[]> {
    const { admin } = this.getInstance(connectionId)
    return admin.listTopics()
  }

  async getTopicMetadata(connectionId: string, topic: string) {
    const { admin } = this.getInstance(connectionId)
    const metadata = await admin.fetchTopicMetadata({ topics: [topic] })
    const topicMetadata = metadata.topics[0]

    const offsets = await admin.fetchTopicOffsets(topic)

    return {
      name: topicMetadata.name,
      partitions: topicMetadata.partitions.map((p, index) => ({
        partition: p.partitionId,
        leader: p.leader,
        replicas: p.replicas,
        isr: p.isr,
        offset: offsets[index]?.offset || '0',
        high: offsets[index]?.high || '0',
        low: offsets[index]?.low || '0'
      }))
    }
  }

  async getTopicConfig(connectionId: string, topic: string) {
    const { admin } = this.getInstance(connectionId)
    const configs = await admin.describeConfigs({
      includeSynonyms: false,
      resources: [{ type: 2, name: topic }] // 2 = TOPIC
    })

    return configs.resources[0]?.configEntries || []
  }

  async getBrokerConfig(connectionId: string) {
    const { admin } = this.getInstance(connectionId)
    const cluster = await admin.describeCluster()

    if (cluster.brokers.length === 0) {
      return []
    }

    // Fetch config from the first broker (broker-level configs are cluster-wide)
    const configs = await admin.describeConfigs({
      includeSynonyms: false,
      resources: [{ type: 4, name: String(cluster.brokers[0].nodeId) }] // 4 = BROKER
    })

    return configs.resources[0]?.configEntries || []
  }

  async createTopic(connectionId: string, config: TopicConfig): Promise<void> {
    const { admin } = this.getInstance(connectionId)
    await admin.createTopics({
      topics: [
        {
          topic: config.name,
          numPartitions: config.numPartitions,
          replicationFactor: config.replicationFactor,
          configEntries: config.configEntries
            ? Object.entries(config.configEntries).map(([name, value]) => ({ name, value }))
            : undefined
        }
      ]
    })
  }

  async deleteTopic(connectionId: string, topic: string): Promise<void> {
    const { admin } = this.getInstance(connectionId)
    await admin.deleteTopics({ topics: [topic] })
  }

  async getMessages(connectionId: string, topic: string, options: MessageOptions = {}) {
    const { kafka, admin } = this.getInstance(connectionId)
    const { partition, fromOffset, fromTimestamp, limit = 100 } = options

    const maxLimit = limit

    // 1. Pre-check offsets via admin API — short-circuit if empty
    const topicOffsets = await admin.fetchTopicOffsets(topic)
    const targetOffsets = partition !== undefined
      ? topicOffsets.filter((o) => o.partition === partition)
      : topicOffsets

    // Build seek map: partition → { seekOffset, high }
    const seekMap = new Map<number, { seekOffset: string; high: string }>()

    if (fromTimestamp) {
      const timestampOffsets = await admin.fetchTopicOffsetsByTimestamp(topic, fromTimestamp)
      for (const tOff of timestampOffsets) {
        if (partition !== undefined && tOff.partition !== partition) continue
        const matched = targetOffsets.find((o) => o.partition === tOff.partition)
        if (matched) {
          seekMap.set(tOff.partition, { seekOffset: tOff.offset, high: matched.high })
        }
      }
    } else {
      for (const off of targetOffsets) {
        const seekOffset = fromOffset ?? off.low
        seekMap.set(off.partition, { seekOffset, high: off.high })
      }
    }

    // Sum expected messages across target partitions
    let totalExpected = 0
    for (const [, { seekOffset, high }] of seekMap) {
      const available = Number(BigInt(high) - BigInt(seekOffset))
      if (available > 0) totalExpected += available
    }

    // Short-circuit: no messages available
    if (totalExpected === 0) {
      return { messages: [], hasMore: false, nextOffset: null }
    }

    // Cap expected count at the fetch limit
    totalExpected = Math.min(totalExpected, maxLimit)

    // 2. Create consumer, subscribe, seek, and collect messages
    const groupId = `topiq-explorer-consumer-${randomUUID()}`
    const consumer = kafka.consumer({ groupId })

    // Track this temporary group for cleanup on shutdown
    this.trackTempGroup(connectionId, groupId)

    let cleanedUp = false
    const cleanup = async () => {
      if (cleanedUp) return
      cleanedUp = true
      try {
        await consumer.disconnect()
      } catch { /* swallow */ }
      try {
        await admin.deleteGroups([groupId])
      } catch { /* group may already be deleted */ }
      this.untrackTempGroup(connectionId, groupId)
    }

    try {
      await consumer.connect()
      await consumer.subscribe({ topic, fromBeginning: true })

      const messages: Array<{
        partition: number
        offset: string
        timestamp: string
        key: string | null
        value: string | null
        headers: Record<string, string>
      }> = []

      return new Promise((resolve, reject) => {
        let messageCount = 0
        let lastOffset: string | null = null
        let lastPartition: number | null = null
        let resolved = false
        let idleTimer: ReturnType<typeof setTimeout> | null = null

        const finish = (hasMore: boolean) => {
          if (resolved) return
          resolved = true
          if (idleTimer) clearTimeout(idleTimer)
          clearTimeout(overallTimeout)
          const result = {
              messages,
              hasMore,
              nextOffset: hasMore && lastOffset ? String(BigInt(lastOffset) + 1n) : null,
              nextPartition: hasMore ? lastPartition : undefined
            }
          cleanup().then(() => resolve(result)).catch(() => resolve(result))
        }

        const resetIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer)
          idleTimer = setTimeout(() => finish(false), 5000)
        }

        // Overall safety-net timeout: 30 seconds
        const overallTimeout = setTimeout(() => finish(false), 30000)

        consumer
          .run({
            eachMessage: async ({ partition: msgPartition, message }) => {
              if (resolved) return

              // Filter by partition if specified
              if (partition !== undefined && msgPartition !== partition) {
                return
              }

              if (messageCount >= maxLimit) {
                finish(true)
                return
              }

              const headers: Record<string, string> = {}
              if (message.headers) {
                for (const [key, value] of Object.entries(message.headers)) {
                  headers[key] = truncate(value?.toString() || '', MAX_HEADER_VALUE_SIZE) || ''
                }
              }

              messages.push({
                partition: msgPartition,
                offset: message.offset,
                timestamp: message.timestamp,
                key: truncate(message.key?.toString() || null, MAX_KEY_SIZE),
                value: truncate(message.value?.toString() || null, MAX_VALUE_SIZE),
                headers
              })

              messageCount++
              lastOffset = message.offset
              lastPartition = msgPartition

              if (messageCount >= maxLimit) {
                finish(true)
              } else if (messageCount >= totalExpected) {
                // All expected messages received — resolve immediately
                finish(false)
              } else {
                resetIdleTimer()
              }
            }
          })
          .then(() => {
            // Seek to exact offsets after run() starts — bypasses group coordination
            for (const [p, { seekOffset }] of seekMap) {
              consumer.seek({ topic, partition: p, offset: seekOffset })
            }
            // Start idle timer after seeks are issued
            resetIdleTimer()
          })
          .catch((error) => {
            if (resolved) return
            resolved = true
            if (idleTimer) clearTimeout(idleTimer)
            clearTimeout(overallTimeout)
            cleanup().then(() => reject(error)).catch(() => reject(error))
          })
      })
    } catch (error) {
      await cleanup()
      throw error
    }
  }

  cancelSearch(requestId: string): void {
    const state = this.activeSearches.get(requestId)
    if (state) {
      state.cancelled = true
    }
  }

  async searchMessages(
    connectionId: string,
    topic: string,
    options: SearchMessageOptions
  ): Promise<SearchMessageResult> {
    if (!options.query || typeof options.query !== 'string') {
      throw new Error('Search query is required')
    }

    const { kafka, admin } = this.getInstance(connectionId)
    const maxScan = options.maxScan ?? 100_000
    const maxMatches = options.maxMatches ?? 200
    const requestId = options.requestId ?? randomUUID()

    const searchState = { cancelled: false }
    this.activeSearches.set(requestId, searchState)

    // Pre-check offsets via admin API
    const topicOffsets = await admin.fetchTopicOffsets(topic)
    const targetOffsets = options.partition !== undefined
      ? topicOffsets.filter((o) => o.partition === options.partition)
      : topicOffsets

    // Build seek map: partition -> { seekOffset, high }
    const seekMap = new Map<number, { seekOffset: string; high: string }>()

    if (options.fromOffset && options.fromPartition !== undefined) {
      // Resume: start from the given partition/offset, then continue with remaining partitions
      for (const off of targetOffsets) {
        if (off.partition < options.fromPartition) continue
        const seekOffset = off.partition === options.fromPartition ? options.fromOffset : off.low
        seekMap.set(off.partition, { seekOffset, high: off.high })
      }
    } else {
      for (const off of targetOffsets) {
        seekMap.set(off.partition, { seekOffset: off.low, high: off.high })
      }
    }

    // Check if there are any messages to scan
    let totalAvailable = 0
    for (const [, { seekOffset, high }] of seekMap) {
      const available = Number(BigInt(high) - BigInt(seekOffset))
      if (available > 0) totalAvailable += available
    }

    if (totalAvailable === 0) {
      this.activeSearches.delete(requestId)
      return { matches: [], scanned: 0, totalMatches: 0, hasMore: false, nextOffset: null, cancelled: false }
    }

    const queryLower = options.query.toLowerCase()
    const groupId = `topiq-explorer-search-${randomUUID()}`
    const consumer = kafka.consumer({ groupId })

    this.trackTempGroup(connectionId, groupId)

    let cleanedUp = false
    const cleanup = async () => {
      if (cleanedUp) return
      cleanedUp = true
      this.activeSearches.delete(requestId)
      try {
        await consumer.disconnect()
      } catch { /* swallow */ }
      try {
        await admin.deleteGroups([groupId])
      } catch { /* group may already be deleted */ }
      this.untrackTempGroup(connectionId, groupId)
    }

    try {
      await consumer.connect()
      await consumer.subscribe({ topic, fromBeginning: true })

      const matches: Array<{
        partition: number
        offset: string
        timestamp: string
        key: string | null
        value: string | null
        headers: Record<string, string>
      }> = []

      return new Promise<SearchMessageResult>((resolve, reject) => {
        let scannedCount = 0
        let lastOffset: string | null = null
        let lastPartition: number | undefined
        let resolved = false
        let idleTimer: ReturnType<typeof setTimeout> | null = null

        const finish = (hasMore: boolean, cancelled: boolean) => {
          if (resolved) return
          resolved = true
          if (idleTimer) clearTimeout(idleTimer)
          clearTimeout(overallTimeout)
          const result = {
              matches,
              scanned: scannedCount,
              totalMatches: matches.length,
              hasMore,
              nextOffset: hasMore && lastOffset ? String(BigInt(lastOffset) + 1n) : null,
              nextPartition: hasMore ? lastPartition : undefined,
              cancelled
            }
          cleanup().then(() => resolve(result)).catch(() => resolve(result))
        }

        const resetIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer)
          idleTimer = setTimeout(() => finish(false, false), 8000)
        }

        // Safety-net timeout: 60 seconds
        const overallTimeout = setTimeout(() => finish(true, false), 60000)

        consumer
          .run({
            eachMessage: async ({ partition: msgPartition, message }) => {
              if (resolved) return

              // Check cancellation
              if (searchState.cancelled) {
                finish(true, true)
                return
              }

              // Filter by partition if specified
              if (options.partition !== undefined && msgPartition !== options.partition) {
                return
              }

              scannedCount++
              lastOffset = message.offset
              lastPartition = msgPartition

              // Match check: case-insensitive substring on key, value, and headers
              const key = message.key?.toString() || ''
              const value = message.value?.toString() || ''

              // Convert headers once upfront (only if headers exist)
              const headers: Record<string, string> = {}
              if (message.headers) {
                for (const [hk, hv] of Object.entries(message.headers)) {
                  headers[hk] = hv?.toString() || ''
                }
              }

              let matched = false
              if (key.toLowerCase().includes(queryLower) || value.toLowerCase().includes(queryLower)) {
                matched = true
              } else {
                for (const [hk, hv] of Object.entries(headers)) {
                  if (hk.toLowerCase().includes(queryLower) || hv.toLowerCase().includes(queryLower)) {
                    matched = true
                    break
                  }
                }
              }

              if (matched) {
                // Truncate headers for the result sent to renderer
                const truncatedHeaders: Record<string, string> = {}
                for (const [hk, hv] of Object.entries(headers)) {
                  truncatedHeaders[hk] = truncate(hv, MAX_HEADER_VALUE_SIZE) || ''
                }
                matches.push({
                  partition: msgPartition,
                  offset: message.offset,
                  timestamp: message.timestamp,
                  key: truncate(key || null, MAX_KEY_SIZE),
                  value: truncate(value || null, MAX_VALUE_SIZE),
                  headers: truncatedHeaders
                })
              }

              // Stopping conditions
              if (matches.length >= maxMatches) {
                finish(true, false)
              } else if (scannedCount >= maxScan) {
                finish(true, false)
              } else {
                resetIdleTimer()
              }
            }
          })
          .then(() => {
            // Seek to exact offsets after run() starts
            for (const [p, { seekOffset }] of seekMap) {
              consumer.seek({ topic, partition: p, offset: seekOffset })
            }
            resetIdleTimer()
          })
          .catch((error) => {
            if (resolved) return
            resolved = true
            if (idleTimer) clearTimeout(idleTimer)
            clearTimeout(overallTimeout)
            cleanup().then(() => reject(error)).catch(() => reject(error))
          })
      })
    } catch (error) {
      await cleanup()
      throw error
    }
  }

  async produceMessage(connectionId: string, topic: string, message: ProduceMessage): Promise<void> {
    const { producer } = this.getInstance(connectionId)

    const headers: Record<string, string> = message.headers || {}

    await producer.send({
      topic,
      messages: [
        {
          key: message.key,
          value: message.value,
          headers,
          partition: message.partition
        }
      ]
    })
  }

  async getConsumerGroups(connectionId: string) {
    const { admin } = this.getInstance(connectionId)

    // Retry logic for intermittent empty results
    const maxRetries = 3
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const groups = await admin.listGroups()

      // If we got results or it's the last attempt, return
      if (groups.groups.length > 0 || attempt === maxRetries) {
        return groups.groups.map((g) => ({
          groupId: g.groupId,
          protocolType: g.protocolType
        }))
      }

      // Small delay before retry
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt))
    }

    return []
  }

  async getConsumerGroupDetails(connectionId: string, groupId: string) {
    const { admin } = this.getInstance(connectionId)

    const [description, offsets] = await Promise.all([
      admin.describeGroups([groupId]),
      admin.fetchOffsets({ groupId })
    ])

    const group = description.groups[0]

    // Batch fetch all topic offsets at once to avoid N+1 queries
    const topics = [...new Set(offsets.map((o) => o.topic))]
    const topicHighOffsetsMap: Record<string, Array<{ partition: number; high: string }>> = {}

    try {
      // Fetch all topic offsets in parallel (single batch operation)
      const allTopicOffsets = await Promise.all(
        topics.map(async (topic) => {
          try {
            const offsets = await admin.fetchTopicOffsets(topic)
            return { topic, offsets, error: null }
          } catch (error) {
            return { topic, offsets: null, error }
          }
        })
      )

      for (const result of allTopicOffsets) {
        if (result.offsets) {
          topicHighOffsetsMap[result.topic] = result.offsets.map((o) => ({
            partition: o.partition,
            high: o.high || '0'
          }))
        }
      }
    } catch {
      // If batch fetch fails, continue with empty map (lag will be null)
    }

    const topicOffsets: Record<string, Array<{ partition: number; offset: string; lag: number | null }>> = {}

    for (const topicOffset of offsets) {
      const topic = topicOffset.topic
      if (!topicOffsets[topic]) {
        topicOffsets[topic] = []
      }

      const topicHighOffsets = topicHighOffsetsMap[topic]

      for (const partitionData of topicOffset.partitions) {
        if (topicHighOffsets) {
          const partitionInfo = topicHighOffsets.find((p) => p.partition === partitionData.partition)
          const currentOffset = parseInt(partitionData.offset, 10)
          const highOffset = parseInt(partitionInfo?.high || '0', 10)
          const lag = Math.max(0, highOffset - currentOffset)

          topicOffsets[topic].push({
            partition: partitionData.partition,
            offset: partitionData.offset,
            lag
          })
        } else {
          // Return null for lag when we couldn't fetch offsets (not 0, which is misleading)
          topicOffsets[topic].push({
            partition: partitionData.partition,
            offset: partitionData.offset,
            lag: null
          })
        }
      }
    }

    return {
      groupId: group.groupId,
      state: group.state,
      protocolType: group.protocolType,
      protocol: group.protocol,
      members: group.members.map((m) => ({
        memberId: m.memberId,
        clientId: m.clientId,
        clientHost: m.clientHost
      })),
      offsets: topicOffsets
    }
  }

  async deleteConsumerGroup(connectionId: string, groupId: string): Promise<void> {
    const { admin } = this.getInstance(connectionId)
    await admin.deleteGroups([groupId])
  }

  async deleteRecords(
    connectionId: string,
    topic: string,
    partitionOffsets: { partition: number; offset: string }[]
  ): Promise<void> {
    const { admin } = this.getInstance(connectionId)
    await admin.deleteTopicRecords({
      topic,
      partitions: partitionOffsets.map(({ partition, offset }) => ({
        partition,
        offset
      }))
    })
  }

  async resetOffsets(
    connectionId: string,
    groupId: string,
    topic: string,
    options: ResetOffsetOptions
  ): Promise<void> {
    const { admin } = this.getInstance(connectionId)

    const topicOffsets = await admin.fetchTopicOffsets(topic)
    // Convert to Map for O(1) lookup instead of O(n) find() in loop
    const offsetMap = new Map(topicOffsets.map((p) => [p.partition, p]))
    const partitions =
      options.partitions || topicOffsets.map((p) => p.partition)

    let newOffsets: Array<{ partition: number; offset: string }>

    switch (options.type) {
      case 'earliest':
        newOffsets = partitions.map((partition) => {
          const info = offsetMap.get(partition)
          return { partition, offset: info?.low || '0' }
        })
        break
      case 'latest':
        newOffsets = partitions.map((partition) => {
          const info = offsetMap.get(partition)
          return { partition, offset: info?.high || '0' }
        })
        break
      case 'timestamp':
        if (!options.timestamp) throw new Error('Timestamp required')
        const offsetsByTimestamp = await admin.fetchTopicOffsetsByTimestamp(topic, options.timestamp)
        newOffsets = partitions.map((partition) => {
          const info = offsetsByTimestamp.find((p) => p.partition === partition)
          return { partition, offset: info?.offset || '0' }
        })
        break
      case 'offset':
        if (!options.offset) throw new Error('Offset required')
        newOffsets = partitions.map((partition) => ({
          partition,
          offset: options.offset!
        }))
        break
      default:
        throw new Error('Invalid reset type')
    }

    await admin.setOffsets({
      groupId,
      topic,
      partitions: newOffsets
    })
  }
}
