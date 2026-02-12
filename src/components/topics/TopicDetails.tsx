import { useState, useEffect } from 'react'
import { useTopicStore } from '@/stores/topic.store'
import { useConnectionStore } from '@/stores/connection.store'
import { MessageViewer } from '../messages/MessageViewer'
import { MessageProducer } from '../messages/MessageProducer'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { MessageSquare, Settings, LayoutGrid, Send, Database, Trash2, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'

export function TopicDetails() {
  const [activeTab, setActiveTab] = useState('messages')
  const [isProducerOpen, setIsProducerOpen] = useState(false)
  const [isDeleteRecordsOpen, setIsDeleteRecordsOpen] = useState(false)
  const [deletePartition, setDeletePartition] = useState('')
  const [deleteOffset, setDeleteOffset] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const selectedTopic = useTopicStore((state) => state.selectedTopic)
  const topicMetadata = useTopicStore((state) => state.topicMetadata)
  const topicConfig = useTopicStore((state) => state.topicConfig)
  const loadMessages = useTopicStore((state) => state.loadMessages)
  const loadTopicMetadata = useTopicStore((state) => state.loadTopicMetadata)
  const messageToRepublish = useTopicStore((state) => state.messageToRepublish)
  const activeConnectionId = useConnectionStore((state) => state.activeConnectionId)

  useEffect(() => {
    if (activeConnectionId && selectedTopic) {
      loadMessages(activeConnectionId, selectedTopic, { limit: 100 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMessages is a stable store action
  }, [activeConnectionId, selectedTopic])

  // Open producer dialog when messageToRepublish is set
  useEffect(() => {
    if (messageToRepublish) {
      setIsProducerOpen(true)
    }
  }, [messageToRepublish])

  const handleDeleteRecords = async () => {
    if (!activeConnectionId || !selectedTopic || !topicMetadata) return

    setIsDeleting(true)
    try {
      const partitionOffsets: { partition: number; offset: string }[] = []

      if (deletePartition === '' || deletePartition === 'all') {
        // Delete from all partitions up to the specified offset
        for (const p of topicMetadata.partitions) {
          const targetOffset = deleteOffset || p.high
          partitionOffsets.push({ partition: p.partition, offset: targetOffset })
        }
      } else {
        // Delete from specific partition
        const partitionNum = parseInt(deletePartition, 10)
        const partitionMeta = topicMetadata.partitions.find((p) => p.partition === partitionNum)
        const targetOffset = deleteOffset || partitionMeta?.high || '0'
        partitionOffsets.push({ partition: partitionNum, offset: targetOffset })
      }

      await window.api.kafka.deleteRecords(activeConnectionId, selectedTopic, partitionOffsets)

      toast({
        title: 'Records Deleted',
        description: `Records before offset ${deleteOffset || 'high watermark'} have been deleted`
      })

      // Refresh metadata and messages
      await loadTopicMetadata(activeConnectionId, selectedTopic)
      await loadMessages(activeConnectionId, selectedTopic, { limit: 100 })

      setIsDeleteRecordsOpen(false)
      setDeletePartition('')
      setDeleteOffset('')
    } catch (error) {
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete records',
        variant: 'destructive'
      })
    } finally {
      setIsDeleting(false)
      setConfirmDeleteOpen(false)
    }
  }

  if (!selectedTopic || !topicMetadata) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <Skeleton className="h-6 w-48 mb-2" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-32 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Database className="mx-auto h-12 w-12 mb-3 opacity-30" />
            <p>Select a topic to view details</p>
          </div>
        </div>
      </div>
    )
  }

  const totalMessages = topicMetadata.partitions.reduce((sum, p) => {
    const high = parseInt(p.high, 10)
    const low = parseInt(p.low, 10)
    return sum + (high - low)
  }, 0)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <h2 className="text-lg font-semibold">{selectedTopic}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{topicMetadata.partitions.length} partitions</Badge>
            <Badge variant="secondary">{totalMessages.toLocaleString()} messages</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isDeleteRecordsOpen} onOpenChange={setIsDeleteRecordsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" aria-label="Delete records from topic">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Records
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px]">
              <DialogHeader>
                <DialogTitle>Delete Records from {selectedTopic}</DialogTitle>
                <DialogDescription>
                  Delete all records before a specific offset. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="deletePartition">Partition</Label>
                  <Input
                    id="deletePartition"
                    placeholder="All partitions"
                    value={deletePartition}
                    onChange={(e) => setDeletePartition(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to delete from all partitions
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deleteOffset">Delete records before offset</Label>
                  <Input
                    id="deleteOffset"
                    placeholder="High watermark (delete all)"
                    value={deleteOffset}
                    onChange={(e) => setDeleteOffset(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to delete all records up to the high watermark
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsDeleteRecordsOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={isDeleting}
                  >
                    Delete Records
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isProducerOpen} onOpenChange={setIsProducerOpen}>
            <DialogTrigger asChild>
              <Button size="sm" aria-label="Produce a new message to topic">
                <Send className="mr-2 h-4 w-4" />
                Produce Message
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Produce Message to {selectedTopic}</DialogTitle>
              </DialogHeader>
              <MessageProducer topic={selectedTopic} onClose={() => setIsProducerOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Delete Records</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete records from {selectedTopic}? This action cannot be undone.
                {deletePartition && deletePartition !== 'all' && (
                  <span className="block mt-2">
                    Partition: {deletePartition}
                  </span>
                )}
                {!deletePartition && (
                  <span className="block mt-2">
                    All partitions will be affected.
                  </span>
                )}
                <span className="block mt-1">
                  Records before offset: {deleteOffset || 'high watermark (all records)'}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteRecords}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isDeleting}
              >
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete Records
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col min-h-0">
        <TabsList className="mx-4 mt-2 justify-start bg-transparent">
          <TabsTrigger value="messages" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Messages
          </TabsTrigger>
          <TabsTrigger value="partitions" className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            Partitions
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuration
          </TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="flex-1 m-0 p-4">
          <MessageViewer />
        </TabsContent>

        <TabsContent value="partitions" className="flex-1 m-0 p-4 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-2">
              <div className="grid grid-cols-6 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground">
                <div>Partition</div>
                <div>Leader</div>
                <div>Replicas</div>
                <div>ISR</div>
                <div>Low Offset</div>
                <div>High Offset</div>
              </div>
              {topicMetadata.partitions.map((partition) => (
                <div
                  key={partition.partition}
                  className="grid grid-cols-6 gap-4 rounded-md border border-border px-4 py-3 text-sm transition-colors hover:bg-accent/50"
                >
                  <div className="font-medium">{partition.partition}</div>
                  <div>{partition.leader}</div>
                  <div>{partition.replicas.join(', ')}</div>
                  <div>{partition.isr.join(', ')}</div>
                  <div className="font-mono text-muted-foreground">{partition.low}</div>
                  <div className="font-mono text-muted-foreground">{partition.high}</div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="config" className="relative flex-1 m-0 min-h-0">
          <div className="absolute inset-0 p-4">
            <ScrollArea className="h-full">
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-4 px-4 py-2 text-sm font-medium text-muted-foreground">
                  <div>Name</div>
                  <div>Value</div>
                  <div>Source</div>
                </div>
                {topicConfig.map((config) => (
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
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
