import Store from 'electron-store'
import { randomUUID, createHash } from 'crypto'
import { machineIdSync } from 'node-machine-id'
import os from 'os'
import fs from 'fs'
import type { KafkaConnection } from '../../shared/types'

// Derive encryption key from machine-specific data
function deriveEncryptionKey(): string {
  try {
    // Use machine ID as primary source (unique per machine)
    const machineId = machineIdSync()
    return createHash('sha256')
      .update(`kafka-explorer-${machineId}`)
      .digest('hex')
      .slice(0, 32)
  } catch {
    // Fallback: derive from hostname + username + homedir
    const fallbackData = `${os.hostname()}-${os.userInfo().username}-${os.homedir()}`
    return createHash('sha256')
      .update(`kafka-explorer-${fallbackData}`)
      .digest('hex')
      .slice(0, 32)
  }
}

interface StoreSchema {
  connections: Record<string, KafkaConnection>
}

// Get the store path without creating a Store instance
function getStorePath(storeName: string): string {
  const appName = 'topiq' // Must match the app name in package.json
  let configDir: string

  switch (process.platform) {
    case 'darwin':
      configDir = `${os.homedir()}/Library/Application Support/${appName}`
      break
    case 'win32':
      configDir = `${process.env.APPDATA || os.homedir()}/${appName}`
      break
    default: // Linux and others
      configDir = `${process.env.XDG_CONFIG_HOME || `${os.homedir()}/.config`}/${appName}`
  }

  return `${configDir}/${storeName}.json`
}

export class ConnectionStore {
  private store: Store<StoreSchema>

  constructor() {
    const encryptionKey = deriveEncryptionKey()
    const storeName = 'kafka-explorer-connections'
    const storePath = getStorePath(storeName)

    // Check if store file exists and try to pre-validate it
    // If encrypted with wrong key, delete it before Store constructor tries to parse it
    if (fs.existsSync(storePath)) {
      try {
        const content = fs.readFileSync(storePath, 'utf-8')
        // Try to parse as JSON - encrypted content will fail
        JSON.parse(content)
        // If we get here, it's valid JSON (unencrypted or already migrated)
      } catch {
        // File exists but can't be parsed - likely encrypted with old key
        console.warn('Connection store encrypted with different key, resetting...')
        try {
          fs.unlinkSync(storePath)
        } catch {
          // Ignore deletion errors
        }
      }
    }

    this.store = new Store<StoreSchema>({
      name: storeName,
      defaults: {
        connections: {}
      },
      encryptionKey
    })
  }

  getAll(): KafkaConnection[] {
    const connections = this.store.get('connections', {})
    return Object.values(connections).sort((a, b) => a.name.localeCompare(b.name))
  }

  get(id: string): KafkaConnection | undefined {
    const connections = this.store.get('connections', {})
    return connections[id]
  }

  save(connection: Omit<KafkaConnection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): KafkaConnection {
    const connections = this.store.get('connections', {})
    const now = Date.now()

    const id = connection.id || randomUUID()
    const existing = connections[id]

    const savedConnection: KafkaConnection = {
      ...connection,
      id,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }

    connections[id] = savedConnection
    this.store.set('connections', connections)

    return savedConnection
  }

  delete(id: string): void {
    const connections = this.store.get('connections', {})
    delete connections[id]
    this.store.set('connections', connections)
  }
}
