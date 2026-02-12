import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { autoUpdater } from 'electron-updater'
import Store from 'electron-store'
import { KafkaService } from './services/kafka.service'
import { ConnectionStore } from './services/connection.store'

// Configure electron-store for updater settings
const settingsStore = new Store<{ updateChannel: 'stable' | 'beta' | 'alpha' }>({
  defaults: {
    updateChannel: 'stable'
  }
})

// Configure autoUpdater
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

function configureUpdaterChannel() {
  const channel = settingsStore.get('updateChannel', 'stable')

  switch (channel) {
    case 'alpha':
      autoUpdater.allowPrerelease = true
      autoUpdater.allowDowngrade = false
      break
    case 'beta':
      autoUpdater.allowPrerelease = true
      autoUpdater.allowDowngrade = false
      break
    case 'stable':
    default:
      autoUpdater.allowPrerelease = false
      autoUpdater.allowDowngrade = false
      break
  }
}

// Check if version matches the current channel filter
function isVersionAllowedForChannel(version: string, channel: 'stable' | 'beta' | 'alpha'): boolean {
  const isAlpha = version.includes('-alpha')
  const isBeta = version.includes('-beta')
  const isPrerelease = isAlpha || isBeta

  switch (channel) {
    case 'alpha':
      return true // Accept all versions
    case 'beta':
      return !isAlpha // Accept stable and beta, not alpha
    case 'stable':
    default:
      return !isPrerelease // Accept only stable versions
  }
}

let mainWindow: BrowserWindow | null = null
const kafkaService = new KafkaService()
const connectionStore = new ConnectionStore()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0a0a0b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  // Configure and check for updates (skip in dev mode)
  if (!process.env.VITE_DEV_SERVER_URL) {
    configureUpdaterChannel()

    // Auto-check for updates 3 seconds after app ready
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {
        // Silently ignore update check errors on startup
      })
    }, 3000)
  }
})

// Forward autoUpdater events to renderer
autoUpdater.on('checking-for-update', () => {
  mainWindow?.webContents.send('updater:checking-for-update')
})

autoUpdater.on('update-available', (info) => {
  const channel = settingsStore.get('updateChannel', 'stable')
  // Filter out updates that don't match the channel
  if (isVersionAllowedForChannel(info.version, channel)) {
    mainWindow?.webContents.send('updater:update-available', info)
  }
})

autoUpdater.on('update-not-available', (info) => {
  mainWindow?.webContents.send('updater:update-not-available', info)
})

autoUpdater.on('download-progress', (progress) => {
  mainWindow?.webContents.send('updater:download-progress', progress)
})

autoUpdater.on('update-downloaded', (info) => {
  mainWindow?.webContents.send('updater:update-downloaded', info)
})

autoUpdater.on('error', (error) => {
  mainWindow?.webContents.send('updater:error', error.message)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  await kafkaService.disconnectAll()
})

// Standardized IPC response helper
function ipcSuccess<T>(data: T) {
  return { success: true as const, data }
}

function ipcError(error: unknown) {
  return { success: false as const, error: error instanceof Error ? error.message : String(error) }
}

// Connection IPC Handlers
ipcMain.handle('connections:getAll', () => {
  try {
    return ipcSuccess(connectionStore.getAll())
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('connections:get', (_, id: string) => {
  try {
    return ipcSuccess(connectionStore.get(id))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('connections:save', (_, connection) => {
  try {
    return ipcSuccess(connectionStore.save(connection))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('connections:delete', (_, id: string) => {
  try {
    connectionStore.delete(id)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('connections:test', async (_, connection) => {
  return kafkaService.testConnection(connection)
})

ipcMain.handle('connections:pickCertFile', async () => {
  try {
    if (!mainWindow) {
      return ipcError('No active window')
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Certificate or Key File',
      filters: [
        { name: 'PEM Files', extensions: ['pem', 'crt', 'key', 'ca', 'cert'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return ipcSuccess(null)
    }

    const filePath = result.filePaths[0]
    const content = fs.readFileSync(filePath, 'utf-8')

    if (!content.includes('-----BEGIN ')) {
      return { success: false as const, error: 'File does not appear to be a valid PEM file. Expected content starting with "-----BEGIN ".' }
    }

    const filename = path.basename(filePath)
    return ipcSuccess({ filename, content })
  } catch (error) {
    return ipcError(error)
  }
})

// Kafka IPC Handlers
ipcMain.handle('kafka:connect', async (_, connectionId: string) => {
  try {
    const connection = connectionStore.get(connectionId)
    if (!connection) {
      return ipcError('Connection not found')
    }
    await kafkaService.connect(connection)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:disconnect', async (_, connectionId: string) => {
  try {
    await kafkaService.disconnect(connectionId)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:getTopics', async (_, connectionId: string) => {
  try {
    return ipcSuccess(await kafkaService.getTopics(connectionId))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:getTopicMetadata', async (_, connectionId: string, topic: string) => {
  try {
    return ipcSuccess(await kafkaService.getTopicMetadata(connectionId, topic))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:getTopicConfig', async (_, connectionId: string, topic: string) => {
  try {
    return ipcSuccess(await kafkaService.getTopicConfig(connectionId, topic))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:createTopic', async (_, connectionId: string, config) => {
  try {
    await kafkaService.createTopic(connectionId, config)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:deleteTopic', async (_, connectionId: string, topic: string) => {
  try {
    await kafkaService.deleteTopic(connectionId, topic)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:getMessages', async (_, connectionId: string, topic: string, options) => {
  try {
    return ipcSuccess(await kafkaService.getMessages(connectionId, topic, options))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:produceMessage', async (_, connectionId: string, topic: string, message) => {
  try {
    await kafkaService.produceMessage(connectionId, topic, message)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:getConsumerGroups', async (_, connectionId: string) => {
  try {
    return ipcSuccess(await kafkaService.getConsumerGroups(connectionId))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:getConsumerGroupDetails', async (_, connectionId: string, groupId: string) => {
  try {
    return ipcSuccess(await kafkaService.getConsumerGroupDetails(connectionId, groupId))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:deleteConsumerGroup', async (_, connectionId: string, groupId: string) => {
  try {
    await kafkaService.deleteConsumerGroup(connectionId, groupId)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:resetOffsets', async (_, connectionId: string, groupId: string, topic: string, options) => {
  try {
    await kafkaService.resetOffsets(connectionId, groupId, topic, options)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:deleteRecords', async (_, connectionId: string, topic: string, partitionOffsets: { partition: number; offset: string }[]) => {
  try {
    await kafkaService.deleteRecords(connectionId, topic, partitionOffsets)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

// Updater IPC Handlers
ipcMain.handle('updater:checkForUpdates', async () => {
  if (process.env.VITE_DEV_SERVER_URL) {
    return { updateAvailable: false, version: app.getVersion() }
  }
  try {
    configureUpdaterChannel()
    const result = await autoUpdater.checkForUpdates()
    if (result && result.updateInfo) {
      const channel = settingsStore.get('updateChannel', 'stable')
      const isAllowed = isVersionAllowedForChannel(result.updateInfo.version, channel)
      return {
        updateAvailable: isAllowed,
        version: result.updateInfo.version,
        releaseNotes: result.updateInfo.releaseNotes,
        releaseDate: result.updateInfo.releaseDate
      }
    }
    return { updateAvailable: false, version: app.getVersion() }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to check for updates')
  }
})

ipcMain.handle('updater:downloadUpdate', async () => {
  if (process.env.VITE_DEV_SERVER_URL) {
    throw new Error('Cannot download updates in development mode')
  }
  try {
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to download update')
  }
})

ipcMain.handle('updater:installUpdate', () => {
  autoUpdater.quitAndInstall(false, true)
})

ipcMain.handle('updater:getVersion', () => {
  return app.getVersion()
})

ipcMain.handle('updater:getChannel', () => {
  return settingsStore.get('updateChannel', 'stable')
})

ipcMain.handle('updater:setChannel', (_, channel: 'stable' | 'beta' | 'alpha') => {
  settingsStore.set('updateChannel', channel)
  configureUpdaterChannel()
  return channel
})
