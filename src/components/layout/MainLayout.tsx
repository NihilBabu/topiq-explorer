import { useState, useEffect } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { Sidebar } from './Sidebar'
import { TopicList } from '../topics/TopicList'
import { TopicDetails } from '../topics/TopicDetails'
import { ConsumerGroupList } from '../consumers/ConsumerGroupList'
import { ConsumerGroupDetails } from '../consumers/ConsumerGroupDetails'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConnectionStore } from '@/stores/connection.store'
import { useTopicStore } from '@/stores/topic.store'
import { useConsumerStore } from '@/stores/consumer.store'
import { Database, Users, Zap } from 'lucide-react'
import { UpdateNotification } from '../updates/UpdateNotification'
import { UpdateSettings } from '../updates/UpdateSettings'

export function MainLayout() {
  const [activeTab, setActiveTab] = useState('topics')
  const [appVersion, setAppVersion] = useState<string>('')
  const activeConnectionId = useConnectionStore((state) => state.activeConnectionId)
  const connectionStatus = useConnectionStore((state) => state.connectionStatus)
  const connections = useConnectionStore((state) => state.connections)
  const selectedTopic = useTopicStore((state) => state.selectedTopic)
  const selectedGroupId = useConsumerStore((state) => state.selectedGroupId)

  const activeConnection = connections.find((c) => c.id === activeConnectionId)
  const isConnected = activeConnectionId && connectionStatus[activeConnectionId] === 'connected'

  useEffect(() => {
    window.api.updater.getVersion().then(setAppVersion)
  }, [])

  return (
    <div className="flex h-screen flex-col">
      {/* Title Bar */}
      <div className="drag-region flex h-12 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-2 pl-16">
          <Zap className="h-5 w-5 text-primary" />
          <span className="font-semibold">Kafka Explorer</span>
        </div>
        <div className="no-drag flex items-center gap-2 text-sm text-muted-foreground">
          {activeConnection && isConnected && (
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full bg-green-500"
                style={{ backgroundColor: activeConnection.color }}
              />
              {activeConnection.name}
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <PanelGroup direction="horizontal" className="flex-1">
        {/* Sidebar */}
        <Panel defaultSize={15} minSize={10} maxSize={25}>
          <Sidebar />
        </Panel>

        <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />

        {/* Content Area */}
        <Panel defaultSize={85}>
          {!isConnected ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Database className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h2 className="mt-4 text-lg font-medium">No Connection Selected</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Select a connection from the sidebar to get started
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
                <div className="border-b border-border px-4">
                  <TabsList className="h-12 bg-transparent">
                    <TabsTrigger
                      value="topics"
                      className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                    >
                      <Database className="mr-2 h-4 w-4" />
                      Topics
                    </TabsTrigger>
                    <TabsTrigger
                      value="consumers"
                      className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                    >
                      <Users className="mr-2 h-4 w-4" />
                      Consumer Groups
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="topics" className="flex-1 mt-0 data-[state=inactive]:hidden">
                  <PanelGroup direction="horizontal">
                    <Panel defaultSize={30} minSize={20} maxSize={50}>
                      <TopicList />
                    </Panel>
                    <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
                    <Panel defaultSize={70}>
                      {selectedTopic ? (
                        <TopicDetails />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <div className="text-center">
                            <Database className="mx-auto h-12 w-12 text-muted-foreground/50" />
                            <p className="mt-4 text-sm text-muted-foreground">Select a topic to view details</p>
                          </div>
                        </div>
                      )}
                    </Panel>
                  </PanelGroup>
                </TabsContent>

                <TabsContent value="consumers" className="flex-1 mt-0 data-[state=inactive]:hidden">
                  <PanelGroup direction="horizontal">
                    <Panel defaultSize={30} minSize={20} maxSize={50}>
                      <ConsumerGroupList />
                    </Panel>
                    <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
                    <Panel defaultSize={70}>
                      {selectedGroupId ? (
                        <ConsumerGroupDetails />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <div className="text-center">
                            <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
                            <p className="mt-4 text-sm text-muted-foreground">
                              Select a consumer group to view details
                            </p>
                          </div>
                        </div>
                      )}
                    </Panel>
                  </PanelGroup>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </Panel>
      </PanelGroup>

      {/* Status Bar */}
      <div className="flex h-6 items-center justify-between border-t border-border bg-card px-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          {activeConnection && isConnected && (
            <>
              <span>Connected to {activeConnection.brokers.join(', ')}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <UpdateSettings compact />
          <span>v{appVersion || '...'}</span>
        </div>
      </div>

      {/* Update Notification */}
      <UpdateNotification />
    </div>
  )
}
