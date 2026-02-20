import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { TopicList } from '../topics/TopicList'
import { TopicDetails } from '../topics/TopicDetails'
import { ConsumerGroupList } from '../consumers/ConsumerGroupList'
import { ConsumerGroupDetails } from '../consumers/ConsumerGroupDetails'
import { ClusterDetails } from '../cluster/ClusterDetails'
import { useConnectionStore } from '@/stores/connection.store'
import { useTopicStore } from '@/stores/topic.store'
import { useConsumerStore } from '@/stores/consumer.store'
import { Terminal } from 'lucide-react'
import { UpdateNotification } from '../updates/UpdateNotification'
import { UpdateSettings } from '../updates/UpdateSettings'

const tabs = [
  { id: 'topics', label: 'Topics' },
  { id: 'consumers', label: 'Groups' },
  { id: 'cluster', label: 'Cluster' },
] as const

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="relative mx-auto h-16 w-16 mb-6">
          <div className="absolute inset-0 rounded-full border border-dashed border-border-mute animate-spin-slow" />
          <div className="absolute inset-3 rounded-full border border-border-mute/60" />
          <div className="absolute inset-[26px] rounded-full bg-accent-active/80" />
        </div>
        <p className="text-sm text-text-secondary">{message}</p>
      </div>
    </div>
  )
}

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

  const tabLabel = activeTab === 'topics' ? 'Topics' : activeTab === 'consumers' ? 'Groups' : 'Cluster'
  const selectedLabel = activeTab === 'topics'
    ? selectedTopic
    : activeTab === 'consumers'
    ? selectedGroupId
    : null

  return (
    <div className="flex h-screen flex-col">
      {/* Title Bar */}
      <div className="drag-region flex h-12 items-center justify-between border-b border-border-mute bg-bg-sidebar px-4 shrink-0">
        <div className="flex items-center gap-2 pl-16">
          <Terminal className="h-4 w-4 text-accent-active" />
          <span className="text-sm font-semibold text-text-primary">Topiq Explorer</span>
        </div>
        <div className="no-drag flex items-center gap-2 text-xs text-text-secondary">
          {activeConnection && isConnected && (
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent-active" />
              <span className="font-mono text-text-secondary">{activeConnection.name}</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Icon Bar */}
        <Sidebar />

        {/* Content Column (right of sidebar) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {isConnected ? (
            <div className="flex flex-1 overflow-hidden">
              {/* Left Panel */}
              <div className="w-80 bg-bg-sidebar border-r border-border-mute flex flex-col shrink-0">
                {/* Tab buttons */}
                <div className="flex items-center border-b border-border-mute">
                  {tabs.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      className={`flex-1 py-3 text-xs font-medium transition-colors border-b-[2px] ${
                        activeTab === id
                          ? 'text-text-primary border-accent-active bg-bg-main'
                          : 'text-text-secondary border-transparent hover:text-text-primary'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* List content */}
                <div className="flex-1 overflow-hidden">
                  {activeTab === 'topics' && <TopicList />}
                  {activeTab === 'consumers' && <ConsumerGroupList />}
                  {activeTab === 'cluster' && (
                    <EmptyState message="Cluster overview in main panel" />
                  )}
                </div>
              </div>

              {/* Main Content Area */}
              <main className="flex-1 bg-bg-main flex flex-col overflow-hidden">
                {/* Breadcrumb bar */}
                <div className="h-12 border-b border-border-mute flex items-center px-8 shrink-0">
                  <div className="flex items-center text-sm text-text-secondary font-mono">
                    <span className="hover:text-text-primary cursor-pointer transition-colors">{tabLabel}</span>
                    {selectedLabel && (
                      <>
                        <span className="mx-2 text-border-mute">/</span>
                        <span className="font-medium text-text-primary truncate max-w-[300px]">{selectedLabel}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden">
                  {activeTab === 'topics' ? (
                    selectedTopic ? (
                      <TopicDetails />
                    ) : (
                      <EmptyState message="Select a topic to view details" />
                    )
                  ) : activeTab === 'consumers' ? (
                    selectedGroupId ? (
                      <ConsumerGroupDetails />
                    ) : (
                      <EmptyState message="Select a consumer group to view details" />
                    )
                  ) : (
                    <ClusterDetails />
                  )}
                </div>

                {/* Status Bar */}
                <div className="flex h-8 items-center justify-between border-t border-border-mute bg-bg-sidebar px-4 text-xs text-text-secondary font-mono shrink-0">
                  <div className="flex items-center gap-3">
                    {activeConnection && isConnected && (
                      <>
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-accent-active" />
                          <span className="text-accent-active">Connected</span>
                        </span>
                        <span className="text-border-mute">|</span>
                        <span>{activeConnection.brokers.join(', ')}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <UpdateSettings compact />
                    <span>v{appVersion || '...'}</span>
                  </div>
                </div>
              </main>
            </div>
          ) : (
            /* Not connected state */
            <div className="flex-1 flex items-center justify-center bg-bg-main">
              <EmptyState message="Select a connection from the sidebar to get started" />
            </div>
          )}
        </div>
      </div>

      {/* Update Notification */}
      <UpdateNotification />
    </div>
  )
}
