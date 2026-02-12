import { useState } from 'react'
import { useConnectionStore } from '@/stores/connection.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { getRandomColor, CONNECTION_COLORS } from '@/lib/utils'
import type { KafkaConnection, TLSConfig } from '@/types/kafka.types'
import { Loader2, Check, X, Upload } from 'lucide-react'

interface CertFile {
  filename: string
  content: string
}

function getInitialSslEnabled(ssl: KafkaConnection['ssl']): boolean {
  return ssl === true || (typeof ssl === 'object' && ssl !== null)
}

function getInitialSslMode(ssl: KafkaConnection['ssl']): 'simple' | 'certificates' {
  if (typeof ssl === 'object' && ssl !== null) {
    return 'certificates'
  }
  return 'simple'
}

function getInitialCertFile(value: string | undefined): CertFile | null {
  if (!value) return null
  return { filename: 'loaded from connection', content: value }
}

interface ConnectionFormProps {
  connection?: KafkaConnection | null
  onClose: () => void
}

export function ConnectionForm({ connection, onClose }: ConnectionFormProps) {
  const existingSsl = connection?.ssl
  const existingTls = typeof existingSsl === 'object' && existingSsl !== null ? existingSsl as TLSConfig : null

  const [name, setName] = useState(connection?.name || '')
  const [brokers, setBrokers] = useState(connection?.brokers.join(', ') || '')
  const [sslEnabled, setSslEnabled] = useState(getInitialSslEnabled(existingSsl))
  const [sslMode, setSslMode] = useState<'simple' | 'certificates'>(getInitialSslMode(existingSsl))
  const [caCert, setCaCert] = useState<CertFile | null>(getInitialCertFile(existingTls?.ca))
  const [clientCert, setClientCert] = useState<CertFile | null>(getInitialCertFile(existingTls?.cert))
  const [clientKey, setClientKey] = useState<CertFile | null>(getInitialCertFile(existingTls?.key))
  const [passphrase, setPassphrase] = useState(existingTls?.passphrase || '')
  const [rejectUnauthorized, setRejectUnauthorized] = useState(existingTls?.rejectUnauthorized !== false)
  const [authType, setAuthType] = useState<'none' | 'sasl'>(connection?.sasl ? 'sasl' : 'none')
  const [saslMechanism, setSaslMechanism] = useState<'plain' | 'scram-sha-256' | 'scram-sha-512'>(
    connection?.sasl?.mechanism || 'plain'
  )
  const [username, setUsername] = useState(connection?.sasl?.username || '')
  const [password, setPassword] = useState(connection?.sasl?.password || '')
  const [color, setColor] = useState(connection?.color || getRandomColor())

  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const addConnection = useConnectionStore((state) => state.addConnection)
  const updateConnection = useConnectionStore((state) => state.updateConnection)
  const testConnection = useConnectionStore((state) => state.testConnection)

  const handlePickCertFile = async (
    setter: (file: CertFile | null) => void
  ) => {
    try {
      const result = await window.api.connections.pickCertFile()
      if (!result.success) {
        toast({
          title: 'Invalid File',
          description: result.error,
          variant: 'destructive'
        })
        return
      }
      if (result.data) {
        setter(result.data)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to pick certificate file',
        variant: 'destructive'
      })
    }
  }

  const getSslValue = (): boolean | TLSConfig | undefined => {
    if (!sslEnabled) return undefined

    if (sslMode === 'simple') return true

    const tlsConfig: TLSConfig = {}
    if (caCert) tlsConfig.ca = caCert.content
    if (clientCert) tlsConfig.cert = clientCert.content
    if (clientKey) tlsConfig.key = clientKey.content
    if (passphrase) tlsConfig.passphrase = passphrase
    if (!rejectUnauthorized) tlsConfig.rejectUnauthorized = false

    // If no custom TLS fields were set, fall back to simple SSL
    if (Object.keys(tlsConfig).length === 0) return true

    return tlsConfig
  }

  const getConnectionData = () => ({
    name: name.trim(),
    brokers: brokers.split(',').map((b) => b.trim()).filter(Boolean),
    ssl: getSslValue(),
    sasl:
      authType === 'sasl'
        ? {
            mechanism: saslMechanism,
            username,
            password
          }
        : undefined,
    color
  })

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await testConnection(getConnectionData())
      setTestResult(result)
    } catch (error) {
      setTestResult({ success: false, error: error instanceof Error ? error.message : 'Test failed' })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim() || !brokers.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Name and brokers are required',
        variant: 'destructive'
      })
      return
    }

    setIsSaving(true)
    try {
      const data = getConnectionData()
      if (connection) {
        await updateConnection({ ...connection, ...data })
        toast({ title: 'Updated', description: 'Connection updated successfully' })
      } else {
        await addConnection(data)
        toast({ title: 'Created', description: 'Connection created successfully' })
      }
      onClose()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save connection',
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }

  const CertFileInput = ({
    label,
    value,
    onChange
  }: {
    label: string
    value: CertFile | null
    onChange: (file: CertFile | null) => void
  }) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        {value ? (
          <>
            <span className="flex-1 truncate rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
              {value.filename}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onChange(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => handlePickCertFile(onChange)}
          >
            <Upload className="h-4 w-4" />
            Select File
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Connection Name</Label>
        <Input
          id="name"
          placeholder="My Kafka Cluster"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="brokers">Bootstrap Servers</Label>
        <Input
          id="brokers"
          placeholder="localhost:9092, localhost:9093"
          value={brokers}
          onChange={(e) => setBrokers(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Comma-separated list of broker addresses</p>
      </div>

      <div className="space-y-2">
        <Label>Color</Label>
        <div className="flex gap-2">
          {CONNECTION_COLORS.map((c) => (
            <button
              key={c}
              className={`h-6 w-6 rounded-full transition-transform ${
                color === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : ''
              }`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="ssl"
          checked={sslEnabled}
          onChange={(e) => setSslEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <Label htmlFor="ssl" className="cursor-pointer">
          Use SSL/TLS
        </Label>
      </div>

      {sslEnabled && (
        <div className="space-y-4 rounded-md border border-border p-4">
          <div className="space-y-2">
            <Label>TLS Mode</Label>
            <Select value={sslMode} onValueChange={(v) => setSslMode(v as 'simple' | 'certificates')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">System CA (default)</SelectItem>
                <SelectItem value="certificates">Custom Certificates</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sslMode === 'certificates' && (
            <div className="space-y-4">
              <CertFileInput label="CA Certificate" value={caCert} onChange={setCaCert} />
              <CertFileInput label="Client Certificate" value={clientCert} onChange={setClientCert} />
              <CertFileInput label="Client Key" value={clientKey} onChange={setClientKey} />

              <div className="space-y-1">
                <Label htmlFor="passphrase">Key Passphrase</Label>
                <Input
                  id="passphrase"
                  type="password"
                  placeholder="Leave empty if key is not encrypted"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="rejectUnauthorized"
                    checked={!rejectUnauthorized}
                    onChange={(e) => setRejectUnauthorized(!e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor="rejectUnauthorized" className="cursor-pointer">
                    Skip certificate verification
                  </Label>
                </div>
                {!rejectUnauthorized && (
                  <p className="text-xs text-amber-500">
                    Warning: Disabling certificate verification makes the connection vulnerable to man-in-the-middle attacks. Only use this for development or self-signed certificates.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Authentication</Label>
        <Select value={authType} onValueChange={(v) => setAuthType(v as 'none' | 'sasl')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="sasl">SASL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {authType === 'sasl' && (
        <div className="space-y-4 rounded-md border border-border p-4">
          <div className="space-y-2">
            <Label>SASL Mechanism</Label>
            <Select value={saslMechanism} onValueChange={(v) => setSaslMechanism(v as typeof saslMechanism)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="plain">PLAIN</SelectItem>
                <SelectItem value="scram-sha-256">SCRAM-SHA-256</SelectItem>
                <SelectItem value="scram-sha-512">SCRAM-SHA-512</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
      )}

      {testResult && (
        <div
          className={`flex items-center gap-2 rounded-md p-3 text-sm ${
            testResult.success
              ? 'bg-success/10 text-success-foreground'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {testResult.success ? (
            <>
              <Check className="h-4 w-4" />
              Connection successful
            </>
          ) : (
            <>
              <X className="h-4 w-4" />
              {testResult.error || 'Connection failed'}
            </>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={handleTest} disabled={isTesting || !brokers.trim()}>
          {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Test Connection
        </Button>
        <Button onClick={handleSave} disabled={isSaving || !name.trim() || !brokers.trim()}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {connection ? 'Update' : 'Create'}
        </Button>
      </div>
    </div>
  )
}
