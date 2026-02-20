import { useState } from 'react'
import { useConsumerStore } from '@/stores/consumer.store'
import { useConnectionStore } from '@/stores/connection.store'
import { OffsetManager } from './OffsetManager'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Users, LayoutGrid, RotateCcw, UserCircle, Loader2, Settings } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

// Broker-level configs relevant to consumer groups
const GROUP_RELATED_CONFIGS = [
  'group.max.session.timeout.ms',
  'group.min.session.timeout.ms',
  'group.max.size',
  'group.initial.rebalance.delay.ms',
  'group.consumer.max.session.timeout.ms',
  'group.consumer.min.session.timeout.ms',
  'group.consumer.max.heartbeat.interval.ms',
  'group.consumer.min.heartbeat.interval.ms',
  'offsets.topic.replication.factor',
  'offsets.topic.num.partitions',
  'offsets.retention.minutes',
  'offsets.commit.timeout.ms',
  'consumer.id.quota.soft.limit',
  'consumer.id.quota.hard.limit',
]

export function ConsumerGroupDetails() {
  const [activeTab, setActiveTab] = useState('offsets')
  const [resetTopic, setResetTopic] = useState<string | null>(null)

  const selectedGroupId = useConsumerStore((state) => state.selectedGroupId)
  const groupDetails = useConsumerStore((state) => state.groupDetails)
  const isLoading = useConsumerStore((state) => state.isLoading)
  const brokerConfig = useConnectionStore((state) => state.brokerConfig)

  const groupRelatedConfigs = brokerConfig.filter((c) =>
    GROUP_RELATED_CONFIGS.includes(c.configName) ||
    c.configName.startsWith('group.') ||
    c.configName.startsWith('offsets.')
  )

  if (!selectedGroupId) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <Skeleton className="h-6 w-48 mb-2" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <UserCircle className="mx-auto h-12 w-12 mb-3 opacity-30" />
            <p>Select a consumer group to view details</p>
          </div>
        </div>
      </div>
    )
  }

  // Show loading state while fetching group details
  if (isLoading && !groupDetails) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="text-lg font-semibold">{selectedGroupId}</h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Loader2 className="mx-auto h-8 w-8 mb-3 animate-spin" />
            <p>Loading group details...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!groupDetails) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="text-lg font-semibold">{selectedGroupId}</h2>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <UserCircle className="mx-auto h-12 w-12 mb-3 opacity-30" />
            <p>Failed to load group details</p>
          </div>
        </div>
      </div>
    )
  }

  const totalLag = Object.values(groupDetails.offsets).reduce(
    (sum, partitions) => sum + partitions.reduce((pSum, p) => pSum + (p.lag ?? 0), 0),
    0
  )

  const getStateColor = (state: string) => {
    switch (state.toLowerCase()) {
      case 'stable':
        return 'success'
      case 'preparingrebalance':
      case 'completingrebalance':
        return 'warning'
      case 'dead':
      case 'empty':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <h2 className="text-lg font-semibold">{selectedGroupId}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={getStateColor(groupDetails.state) as any}>{groupDetails.state}</Badge>
            <Badge variant="secondary">{groupDetails.members.length} members</Badge>
            <Badge variant={totalLag > 0 ? 'warning' : 'secondary'}>{totalLag.toLocaleString()} total lag</Badge>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col">
        <TabsList className="mx-4 mt-2 justify-start bg-transparent">
          <TabsTrigger value="offsets" className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            Topic Offsets
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuration
          </TabsTrigger>
        </TabsList>

        <TabsContent value="offsets" className="flex-1 m-0 p-4">
          <ScrollArea className="h-full">
            <div className="space-y-4">
              {Object.entries(groupDetails.offsets).length === 0 ? (
                <div className="text-center text-muted-foreground py-8">No topic offsets found</div>
              ) : (
                Object.entries(groupDetails.offsets).map(([topic, partitions]) => {
                  const topicLag = partitions.reduce((sum, p) => sum + (p.lag ?? 0), 0)

                  return (
                    <div key={topic} className="rounded-md border border-border">
                      <div className="flex items-center justify-between border-b border-border p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{topic}</span>
                          <Badge variant="secondary">{partitions.length} partitions</Badge>
                          <Badge variant={topicLag > 0 ? 'warning' : 'secondary'}>
                            {topicLag.toLocaleString()} lag
                          </Badge>
                        </div>
                        <Dialog open={resetTopic === topic} onOpenChange={(open) => setResetTopic(open ? topic : null)}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" aria-label={`Reset offsets for topic ${topic}`}>
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Reset Offsets
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Reset Offsets for {topic}</DialogTitle>
                            </DialogHeader>
                            <OffsetManager
                              groupId={selectedGroupId}
                              topic={topic}
                              partitions={partitions}
                              onClose={() => setResetTopic(null)}
                            />
                          </DialogContent>
                        </Dialog>
                      </div>

                      <div className="divide-y divide-border">
                        <div className="grid grid-cols-3 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground">
                          <div>Partition</div>
                          <div>Offset</div>
                          <div>Lag</div>
                        </div>
                        {partitions.map((partition) => (
                          <div
                            key={partition.partition}
                            className="grid grid-cols-3 gap-4 px-4 py-2 text-sm transition-colors hover:bg-accent/50"
                          >
                            <div className="font-medium">{partition.partition}</div>
                            <div className="font-mono text-muted-foreground">{partition.offset}</div>
                            <div className={partition.lag != null && partition.lag > 0 ? 'text-warning-foreground' : 'text-muted-foreground'}>
                              {partition.lag?.toLocaleString() ?? 'N/A'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="members" className="flex-1 m-0 p-4">
          <ScrollArea className="h-full">
            <div className="space-y-2">
              {groupDetails.members.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">No active members</div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground">
                    <div>Client ID</div>
                    <div>Client Host</div>
                    <div>Member ID</div>
                  </div>
                  {groupDetails.members.map((member) => (
                    <div
                      key={member.memberId}
                      className="grid grid-cols-3 gap-4 rounded-md border border-border px-4 py-3 text-sm transition-colors hover:bg-accent/50"
                    >
                      <div className="font-medium">{member.clientId}</div>
                      <div className="text-muted-foreground">{member.clientHost}</div>
                      <div className="font-mono text-xs text-muted-foreground truncate">{member.memberId}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="config" className="flex-1 m-0 p-4">
          <ScrollArea className="h-full">
            <div className="space-y-2">
              {groupRelatedConfigs.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No group-related broker configuration available.
                  <br />
                  <span className="text-xs">Visit the Cluster tab to load broker configuration.</span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground">
                    <div>Name</div>
                    <div>Value</div>
                    <div>Source</div>
                  </div>
                  {groupRelatedConfigs.map((config) => (
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
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
