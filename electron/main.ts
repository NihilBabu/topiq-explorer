import { app, BrowserWindow, ipcMain, dialog, session } from 'electron'
import path from 'path'
import fs from 'fs'
import { autoUpdater } from 'electron-updater'
import { KafkaService } from './services/kafka.service'
import { ConnectionStore } from './services/connection.store'

// Configure autoUpdater
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false
autoUpdater.allowPrerelease = false
autoUpdater.allowDowngrade = false

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
      sandbox: true
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Restrict navigation to only the dev server URL (Electron security checklist #13)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!process.env.VITE_DEV_SERVER_URL || !url.startsWith(process.env.VITE_DEV_SERVER_URL)) {
      event.preventDefault()
    }
  })

  // Deny all new window creation (Electron security checklist #14)
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Deny all permission requests (Electron security checklist #5)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  // Auto-check for updates 3 seconds after app ready (skip in dev mode)
  if (!process.env.VITE_DEV_SERVER_URL) {
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
  mainWindow?.webContents.send('updater:update-available', info)
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

// Sanitize error messages to avoid leaking internal details (IPs, hostnames, SASL info)
function sanitizeErrorMessage(message: string): string {
  // Strip IP addresses (IPv4)
  let sanitized = message.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?\b/g, '<redacted>')
  // Strip hostnames in common broker address patterns (host:port)
  sanitized = sanitized.replace(/\b[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+:\d{2,5}\b/g, '<redacted>')
  // Strip SASL mechanism details
  sanitized = sanitized.replace(/SASL\s+\w+\s+authentication/gi, 'SASL authentication')
  // Strip stack traces (lines starting with "at ")
  sanitized = sanitized.replace(/\n\s*at\s+.*/g, '')
  return sanitized
}

function ipcError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return { success: false as const, error: sanitizeErrorMessage(message) }
}

// Input validation helpers
const TOPIC_NAME_REGEX = /^[a-zA-Z0-9._-]+$/
const MAX_TOPIC_NAME_LENGTH = 249
const MAX_MESSAGE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_SEARCH_QUERY_LENGTH = 1000
const MAX_LIMIT = 10_000

function validateConnectionId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Invalid connection ID')
  }
}

function validateTopicName(topic: unknown): asserts topic is string {
  if (typeof topic !== 'string' || topic.length === 0 || topic.length > MAX_TOPIC_NAME_LENGTH || !TOPIC_NAME_REGEX.test(topic)) {
    throw new Error('Invalid topic name')
  }
}

function validateGroupId(groupId: unknown): asserts groupId is string {
  if (typeof groupId !== 'string' || groupId.length === 0) {
    throw new Error('Invalid consumer group ID')
  }
}

function validateMessageOptions(options: unknown): void {
  if (options == null || typeof options !== 'object') return
  const opts = options as Record<string, unknown>
  if (opts.partition !== undefined && (typeof opts.partition !== 'number' || opts.partition < 0 || !Number.isInteger(opts.partition))) {
    throw new Error('Invalid partition number')
  }
  if (opts.fromOffset !== undefined && (typeof opts.fromOffset !== 'string' || !/^\d+$/.test(opts.fromOffset))) {
    throw new Error('Invalid offset')
  }
  if (opts.limit !== undefined && (typeof opts.limit !== 'number' || opts.limit < 1 || opts.limit > MAX_LIMIT || !Number.isInteger(opts.limit))) {
    throw new Error(`Limit must be between 1 and ${MAX_LIMIT}`)
  }
}

function validateSearchOptions(options: unknown): void {
  if (options == null || typeof options !== 'object') {
    throw new Error('Search options are required')
  }
  const opts = options as Record<string, unknown>
  if (typeof opts.query !== 'string' || opts.query.length === 0 || opts.query.length > MAX_SEARCH_QUERY_LENGTH) {
    throw new Error(`Search query must be between 1 and ${MAX_SEARCH_QUERY_LENGTH} characters`)
  }
  if (opts.partition !== undefined && (typeof opts.partition !== 'number' || opts.partition < 0 || !Number.isInteger(opts.partition))) {
    throw new Error('Invalid partition number')
  }
}

function validateProduceMessage(message: unknown): void {
  if (message == null || typeof message !== 'object') {
    throw new Error('Message is required')
  }
  const msg = message as Record<string, unknown>
  if (msg.key !== undefined && msg.key !== null && typeof msg.key !== 'string') {
    throw new Error('Message key must be a string')
  }
  if (msg.value !== undefined && msg.value !== null) {
    if (typeof msg.value !== 'string') {
      throw new Error('Message value must be a string')
    }
    if (msg.value.length > MAX_MESSAGE_SIZE) {
      throw new Error(`Message value exceeds maximum size of ${MAX_MESSAGE_SIZE} bytes`)
    }
  }
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
    validateConnectionId(id)
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
    validateConnectionId(id)
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
    validateConnectionId(connectionId)
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
    validateConnectionId(connectionId)
    await kafkaService.disconnect(connectionId)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:getClusterInfo', async (_, connectionId: string) => {
  try {
    validateConnectionId(connectionId)
    return ipcSuccess(await kafkaService.getClusterInfo(connectionId))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:getTopics', async (_, connectionId: string) => {
  try {
    validateConnectionId(connectionId)
    return ipcSuccess(await kafkaService.getTopics(connectionId))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:getTopicMetadata', async (_, connectionId: string, topic: string) => {
  try {
    validateConnectionId(connectionId)
    validateTopicName(topic)
    return ipcSuccess(await kafkaService.getTopicMetadata(connectionId, topic))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:getTopicConfig', async (_, connectionId: string, topic: string) => {
  try {
    validateConnectionId(connectionId)
    validateTopicName(topic)
    return ipcSuccess(await kafkaService.getTopicConfig(connectionId, topic))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:getBrokerConfig', async (_, connectionId: string) => {
  try {
    validateConnectionId(connectionId)
    return ipcSuccess(await kafkaService.getBrokerConfig(connectionId))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:createTopic', async (_, connectionId: string, config) => {
  try {
    validateConnectionId(connectionId)
    if (config && typeof config === 'object' && typeof config.name === 'string') {
      validateTopicName(config.name)
    }
    await kafkaService.createTopic(connectionId, config)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:deleteTopic', async (_, connectionId: string, topic: string) => {
  try {
    validateConnectionId(connectionId)
    validateTopicName(topic)
    await kafkaService.deleteTopic(connectionId, topic)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:getMessages', async (_, connectionId: string, topic: string, options) => {
  try {
    validateConnectionId(connectionId)
    validateTopicName(topic)
    validateMessageOptions(options)
    return ipcSuccess(await kafkaService.getMessages(connectionId, topic, options))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:searchMessages', async (_, connectionId: string, topic: string, options) => {
  try {
    validateConnectionId(connectionId)
    validateTopicName(topic)
    validateSearchOptions(options)
    return ipcSuccess(await kafkaService.searchMessages(connectionId, topic, options))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:cancelSearch', async (_, connectionId: string, requestId: string) => {
  try {
    validateConnectionId(connectionId)
    if (typeof requestId !== 'string' || requestId.length === 0) {
      throw new Error('Invalid request ID')
    }
    kafkaService.cancelSearch(requestId)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:produceMessage', async (_, connectionId: string, topic: string, message) => {
  try {
    validateConnectionId(connectionId)
    validateTopicName(topic)
    validateProduceMessage(message)
    await kafkaService.produceMessage(connectionId, topic, message)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:getConsumerGroups', async (_, connectionId: string) => {
  try {
    validateConnectionId(connectionId)
    return ipcSuccess(await kafkaService.getConsumerGroups(connectionId))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:getConsumerGroupDetails', async (_, connectionId: string, groupId: string) => {
  try {
    validateConnectionId(connectionId)
    validateGroupId(groupId)
    return ipcSuccess(await kafkaService.getConsumerGroupDetails(connectionId, groupId))
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:deleteConsumerGroup', async (_, connectionId: string, groupId: string) => {
  try {
    validateConnectionId(connectionId)
    validateGroupId(groupId)
    await kafkaService.deleteConsumerGroup(connectionId, groupId)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:resetOffsets', async (_, connectionId: string, groupId: string, topic: string, options) => {
  try {
    validateConnectionId(connectionId)
    validateGroupId(groupId)
    validateTopicName(topic)
    await kafkaService.resetOffsets(connectionId, groupId, topic, options)
    return ipcSuccess(undefined)
  } catch (error) {
    return ipcError(error)
  }
})

ipcMain.handle('kafka:deleteRecords', async (_, connectionId: string, topic: string, partitionOffsets: { partition: number; offset: string }[]) => {
  try {
    validateConnectionId(connectionId)
    validateTopicName(topic)
    if (!Array.isArray(partitionOffsets) || partitionOffsets.length === 0) {
      throw new Error('Partition offsets are required')
    }
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
    const result = await autoUpdater.checkForUpdates()
    if (result && result.updateInfo) {
      return {
        updateAvailable: true,
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
