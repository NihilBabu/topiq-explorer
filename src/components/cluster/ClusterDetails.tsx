import { useEffect, useState } from 'react'
import { useConnectionStore } from '@/stores/connection.store'
import { useTopicStore } from '@/stores/topic.store'
import { useConsumerStore } from '@/stores/consumer.store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Server, Crown, Network, Hash, Search, Settings } from 'lucide-react'

export function ClusterDetails() {
  const [configSearch, setConfigSearch] = useState('')
  const activeConnectionId = useConnectionStore((state) => state.activeConnectionId)
  const clusterInfo = useConnectionStore((state) => state.clusterInfo)
  const isLoadingClusterInfo = useConnectionStore((state) => state.isLoadingClusterInfo)
  const loadClusterInfo = useConnectionStore((state) => state.loadClusterInfo)
  const activeConnection = useConnectionStore((state) => state.getActiveConnection())
  const brokerConfig = useConnectionStore((state) => state.brokerConfig)
  const isLoadingBrokerConfig = useConnectionStore((state) => state.isLoadingBrokerConfig)
  const loadBrokerConfig = useConnectionStore((state) => state.loadBrokerConfig)
  const topics = useTopicStore((state) => state.topics)
  const consumerGroups = useConsumerStore((state) => state.consumerGroups)

  useEffect(() => {
    if (activeConnectionId && !clusterInfo && !isLoadingClusterInfo) {
      loadClusterInfo(activeConnectionId)
    }
  }, [activeConnectionId, clusterInfo, isLoadingClusterInfo, loadClusterInfo])

  useEffect(() => {
    if (activeConnectionId && brokerConfig.length === 0 && !isLoadingBrokerConfig) {
      loadBrokerConfig(activeConnectionId)
    }
  }, [activeConnectionId, brokerConfig.length, isLoadingBrokerConfig, loadBrokerConfig])

  if (isLoadingClusterInfo) {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  if (!clusterInfo) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Cluster information unavailable</p>
      </div>
    )
  }

  const controllerBroker = clusterInfo.brokers.find((b) => b.nodeId === clusterInfo.controller)

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Cluster Overview */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Cluster Overview</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Server className="h-4 w-4" />
                <span className="text-xs font-medium">Brokers</span>
              </div>
              <p className="text-2xl font-semibold">{clusterInfo.brokers.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Hash className="h-4 w-4" />
                <span className="text-xs font-medium">Topics</span>
              </div>
              <p className="text-2xl font-semibold">{topics.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Network className="h-4 w-4" />
                <span className="text-xs font-medium">Consumer Groups</span>
              </div>
              <p className="text-2xl font-semibold">{consumerGroups.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Crown className="h-4 w-4" />
                <span className="text-xs font-medium">Controller</span>
              </div>
              <p className="text-2xl font-semibold">
                {controllerBroker ? `${controllerBroker.nodeId}` : clusterInfo.controller}
              </p>
            </div>
          </div>
        </div>

        {/* Cluster Details */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Details</h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-2.5 text-muted-foreground font-medium whitespace-nowrap w-48">Cluster ID</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{clusterInfo.clusterId}</td>
                </tr>
                {clusterInfo.kafkaVersion && (
                  <tr>
                    <td className="px-4 py-2.5 text-muted-foreground font-medium whitespace-nowrap w-48">Kafka Version</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="secondary">{clusterInfo.kafkaVersion}</Badge>
                    </td>
                  </tr>
                )}
                {activeConnection && (
                  <>
                    <tr>
                      <td className="px-4 py-2.5 text-muted-foreground font-medium whitespace-nowrap w-48">Connection Name</td>
                      <td className="px-4 py-2.5">{activeConnection.name}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-muted-foreground font-medium whitespace-nowrap w-48">Bootstrap Servers</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{activeConnection.brokers.join(', ')}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-muted-foreground font-medium whitespace-nowrap w-48">Authentication</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline">
                          {activeConnection.sasl ? activeConnection.sasl.mechanism.toUpperCase() : 'None'}
                        </Badge>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-muted-foreground font-medium whitespace-nowrap w-48">SSL/TLS</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline">
                          {activeConnection.ssl ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Brokers Table */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Brokers</h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Node ID</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Host</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Port</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clusterInfo.brokers
                  .sort((a, b) => a.nodeId - b.nodeId)
                  .map((broker) => (
                    <tr key={broker.nodeId}>
                      <td className="px-4 py-2.5 font-mono">{broker.nodeId}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{broker.host}</td>
                      <td className="px-4 py-2.5 font-mono">{broker.port}</td>
                      <td className="px-4 py-2.5">
                        {broker.nodeId === clusterInfo.controller ? (
                          <Badge variant="default" className="text-xs">
                            <Crown className="mr-1 h-3 w-3" />
                            Controller
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Broker</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Broker Configuration */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-muted-foreground">Broker Configuration</h3>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search config..."
                value={configSearch}
                onChange={(e) => setConfigSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
          {isLoadingBrokerConfig ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : brokerConfig.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 rounded-lg border border-border">
              Unable to load broker configuration
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground">
                <div>Name</div>
                <div>Value</div>
                <div>Source</div>
              </div>
              {brokerConfig
                .filter((config) =>
                  configSearch === '' || config.configName.toLowerCase().includes(configSearch.toLowerCase())
                )
                .map((config) => (
                  <div
                    key={config.configName}
                    className="grid grid-cols-3 gap-4 rounded-md border border-border px-4 py-3 text-sm transition-colors hover:bg-accent/50"
                  >
                    <div className="font-medium">{config.configName}</div>
                    <div className="font-mono text-muted-foreground truncate">
                      {config.isSensitive ? '********' : config.configValue || '-'}
                    </div>
                    <div className="flex items-center gap-2">
                      {config.isDefault && <Badge variant="secondary">Default</Badge>}
                      {config.readOnly && <Badge variant="outline">Read Only</Badge>}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  )
}
