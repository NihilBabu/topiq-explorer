import { useEffect } from 'react'
import { MainLayout } from './components/layout/MainLayout'
import { Toaster } from './components/ui/toaster'
import { useConnectionStore } from './stores/connection.store'

export default function App() {
  const loadConnections = useConnectionStore((state) => state.loadConnections)

  useEffect(() => {
    // Add dark class to document root for Radix UI portals
    document.documentElement.classList.add('dark')
  }, [])

  useEffect(() => {
    loadConnections()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadConnections is a stable store action
  }, [])

  return (
    <div className="dark h-screen w-screen overflow-hidden bg-background text-foreground">
      <MainLayout />
      <Toaster />
    </div>
  )
}
