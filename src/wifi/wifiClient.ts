import { retryWithBackoff } from '../ble/reconnect'
import type {
  Command,
  GloveTransport,
  MotorPacket,
  SensorPacket,
  StatusPacket,
} from '../ble/types'

const PROTOCOL = 'wifi-v1'
const HEALTH_TIMEOUT_MS = 4000
const HANDSHAKE_TIMEOUT_MS = 5000
const COMMAND_TIMEOUT_MS = 5000

type Callback<T> = (value: T) => void
type EmptyCallback = () => void
type ReconnectingCallback = (attempt: number) => void

interface PendingCommand {
  resolve: () => void
  reject: (error: Error) => void
  timeout: number
}

interface WifiMessage {
  type?: unknown
  [key: string]: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asMessage(value: unknown): WifiMessage {
  if (!isRecord(value)) throw new Error('El guante envio un mensaje Wi-Fi invalido.')
  return value
}

function asNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`El campo Wi-Fi ${name} no es valido.`)
  }
  return value
}

function asNumberArray(value: unknown, name: string, length: number): number[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`El campo Wi-Fi ${name} debe contener ${length} valores.`)
  }
  return value.map((item) => asNumber(item, name))
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new Error('Escribe la IP o el nombre del guante.')
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`
  const url = new URL(withScheme)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('La direccion del guante debe usar http:// o https://.')
  }
  return url.toString().replace(/\/$/, '')
}

function websocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws/telemetry'
  url.search = ''
  return url.toString()
}

function createRequestId(): string {
  if (globalThis.crypto?.randomUUID !== undefined) return globalThis.crypto.randomUUID()
  return `wifi-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function messageError(message: WifiMessage): Error {
  const detail = typeof message.message === 'string'
    ? message.message
    : typeof message.error === 'string' ? message.error : 'Error del guante.'
  return new Error(detail)
}

export class WifiClient implements GloveTransport {
  private baseUrl: string
  private socket: WebSocket | undefined
  private shouldReconnect = true
  private reconnecting = false
  private connected = false
  private readonly pendingCommands = new Map<string, PendingCommand>()
  private readonly sensorCallbacks = new Set<Callback<SensorPacket>>()
  private readonly motorCallbacks = new Set<Callback<MotorPacket>>()
  private readonly statusCallbacks = new Set<Callback<StatusPacket>>()
  private readonly disconnectedCallbacks = new Set<EmptyCallback>()
  private readonly reconnectingCallbacks = new Set<ReconnectingCallback>()
  private readonly reconnectedCallbacks = new Set<EmptyCallback>()
  private readonly reconnectFailedCallbacks = new Set<EmptyCallback>()

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = normalizeBaseUrl(baseUrl)
  }

  async connect(): Promise<void> {
    if (this.connected) return
    this.shouldReconnect = true
    this.reconnecting = false
    this.baseUrl = normalizeBaseUrl(this.baseUrl)
    await this.checkHealth()
    await this.openSocket(false)
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false
    this.reconnecting = false
    this.connected = false
    this.rejectPendingCommands(new Error('La conexion Wi-Fi fue cerrada.'))
    const socket = this.socket
    this.socket = undefined
    if (socket !== undefined && socket.readyState !== WebSocket.CLOSED) {
      socket.close(1000, 'client disconnect')
    }
  }

  onSensors(callback: Callback<SensorPacket>): () => void {
    this.sensorCallbacks.add(callback)
    return () => this.sensorCallbacks.delete(callback)
  }

  onMotors(callback: Callback<MotorPacket>): () => void {
    this.motorCallbacks.add(callback)
    return () => this.motorCallbacks.delete(callback)
  }

  onStatus(callback: Callback<StatusPacket>): () => void {
    this.statusCallbacks.add(callback)
    return () => this.statusCallbacks.delete(callback)
  }

  onDisconnected(callback: EmptyCallback): () => void {
    this.disconnectedCallbacks.add(callback)
    return () => this.disconnectedCallbacks.delete(callback)
  }

  onReconnecting(callback: ReconnectingCallback): () => void {
    this.reconnectingCallbacks.add(callback)
    return () => this.reconnectingCallbacks.delete(callback)
  }

  onReconnected(callback: EmptyCallback): () => void {
    this.reconnectedCallbacks.add(callback)
    return () => this.reconnectedCallbacks.delete(callback)
  }

  onReconnectFailed(callback: EmptyCallback): () => void {
    this.reconnectFailedCallbacks.add(callback)
    return () => this.reconnectFailedCallbacks.delete(callback)
  }

  async sendCommand(command: Command): Promise<void> {
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('El guante no esta conectado por Wi-Fi.')
    }

    const requestId = createRequestId()
    const payload: Record<string, unknown> = {
      type: 'command', version: 1, requestId, command: command.type,
    }
    if (command.type === 'SET_MODE') payload.mode = command.mode
    if (command.type === 'SET_ASSIST_LEVEL') payload.level = command.level
    if (command.type === 'HEARTBEAT') payload.counter = command.counter & 0xff

    await new Promise<void>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        this.pendingCommands.delete(requestId)
        reject(new Error(`El guante no confirmo el comando ${command.type}.`))
      }, COMMAND_TIMEOUT_MS)
      this.pendingCommands.set(requestId, { resolve, reject, timeout })
      this.socket?.send(JSON.stringify(payload))
    })
  }

  private async checkHealth(): Promise<void> {
    if (globalThis.location?.protocol === 'https:' && this.baseUrl.startsWith('http:')) {
      throw new Error('Esta PWA usa HTTPS y el guante usa HTTP. Abre la PWA en HTTP local o configura HTTPS en el guante.')
    }
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
    try {
      const response = await fetch(`${this.baseUrl}/device/health`, {
        signal: controller.signal, headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`El guante respondio con HTTP ${response.status}.`)
      const health = asMessage(await response.json())
      if (health.protocol !== undefined && health.protocol !== PROTOCOL) {
        throw new Error('La version del protocolo Wi-Fi del guante no es compatible.')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('No se pudo alcanzar el guante por Wi-Fi.', { cause: error })
      }
      if (error instanceof Error) throw error
      throw new Error('No se pudo alcanzar el guante por Wi-Fi.', { cause: error })
    } finally {
      globalThis.clearTimeout(timeout)
    }
  }

  private openSocket(isReconnect: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(websocketUrl(this.baseUrl))
      let handshakeFinished = false
      let settled = false
      const handshakeTimeout = globalThis.setTimeout(() => {
        if (!settled) {
          settled = true
          socket.close()
          reject(new Error('El guante no completo el handshake Wi-Fi.'))
        }
      }, HANDSHAKE_TIMEOUT_MS)
      this.socket = socket

      const failHandshake = (error: Error) => {
        if (settled) return
        settled = true
        globalThis.clearTimeout(handshakeTimeout)
        reject(error)
      }

      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: 'hello', protocol: PROTOCOL, clientId: this.clientId(), requestedRateHz: 50,
        }))
      }
      socket.onmessage = (event) => {
        try {
          const message = asMessage(JSON.parse(String(event.data)))
          if (message.type === 'hello_ack') {
            if (message.protocol !== PROTOCOL) {
              failHandshake(new Error('El guante rechazo la version del protocolo Wi-Fi.'))
              socket.close()
              return
            }
            handshakeFinished = true
            this.connected = true
            globalThis.clearTimeout(handshakeTimeout)
            if (!settled) {
              settled = true
              resolve()
            }
            if (isReconnect) for (const callback of this.reconnectedCallbacks) callback()
            return
          }
          this.handleMessage(message)
        } catch (error) {
          if (!handshakeFinished) {
            failHandshake(error instanceof Error ? error : new Error('Handshake Wi-Fi invalido.'))
          }
        }
      }
      socket.onerror = () => failHandshake(new Error('No se pudo abrir el canal WebSocket del guante.'))
      socket.onclose = () => {
        globalThis.clearTimeout(handshakeTimeout)
        if (!handshakeFinished) {
          failHandshake(new Error('El guante cerro el canal Wi-Fi durante el handshake.'))
          return
        }
        if (this.socket === socket) this.socket = undefined
        const wasConnected = this.connected
        this.connected = false
        this.rejectPendingCommands(new Error('Se perdio la conexion Wi-Fi con el guante.'))
        if (wasConnected) for (const callback of this.disconnectedCallbacks) callback()
        if (this.shouldReconnect && !this.reconnecting) void this.reconnect()
      }
    })
  }

  private async reconnect(): Promise<void> {
    this.reconnecting = true
    try {
      await retryWithBackoff(
        async () => { await this.checkHealth(); await this.openSocket(true) },
        (attempt) => { for (const callback of this.reconnectingCallbacks) callback(attempt) },
      )
    } catch {
      for (const callback of this.reconnectFailedCallbacks) callback()
    } finally {
      this.reconnecting = false
    }
  }

  private handleMessage(message: WifiMessage): void {
    switch (message.type) {
      case 'telemetry': this.handleTelemetry(message); return
      case 'status': this.handleStatus(message); return
      case 'ack': this.handleAck(message); return
      case 'error': this.handleError(message); return
      case 'ping': this.socket?.send(JSON.stringify({ type: 'pong', timestamp: Date.now() })); return
      default: return
    }
  }

  private handleTelemetry(message: WifiMessage): void {
    const flex = asNumberArray(message.flex, 'flex', 5) as [number, number, number, number, number]
    const encoderCounts = asNumberArray(message.encoderCounts, 'encoderCounts', 5) as [number, number, number, number, number]
    const sensorPacket: SensorPacket = {
      seq: asNumber(message.seq, 'seq'), flex, emgEnvelope: asNumber(message.emgEnvelope, 'emgEnvelope'),
      fsr: asNumber(message.fsr, 'fsr'), state: asNumber(message.state, 'state') as SensorPacket['state'],
      batteryPct: asNumber(message.batteryPct, 'batteryPct'),
    }
    for (const callback of this.sensorCallbacks) callback(sensorPacket)
    const motorPacket: MotorPacket = { encoderCounts }
    for (const callback of this.motorCallbacks) callback(motorPacket)
  }

  private handleStatus(message: WifiMessage): void {
    const status: StatusPacket = {
      state: asNumber(message.state, 'state') as StatusPacket['state'],
      errorCode: asNumber(message.errorCode, 'errorCode'), flags: asNumber(message.flags, 'flags'),
    }
    for (const callback of this.statusCallbacks) callback(status)
  }

  private handleAck(message: WifiMessage): void {
    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined
    if (requestId === undefined) return
    const pending = this.pendingCommands.get(requestId)
    if (pending === undefined) return
    this.pendingCommands.delete(requestId)
    globalThis.clearTimeout(pending.timeout)
    if (message.accepted === true) pending.resolve()
    else pending.reject(messageError(message))
  }

  private handleError(message: WifiMessage): void {
    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined
    if (requestId === undefined) return
    const pending = this.pendingCommands.get(requestId)
    if (pending === undefined) return
    this.pendingCommands.delete(requestId)
    globalThis.clearTimeout(pending.timeout)
    pending.reject(messageError(message))
  }

  private rejectPendingCommands(error: Error): void {
    for (const [requestId, pending] of this.pendingCommands) {
      this.pendingCommands.delete(requestId)
      globalThis.clearTimeout(pending.timeout)
      pending.reject(error)
    }
  }

  private clientId(): string {
    const key = 'guante-rehab-wifi-client-id'
    const existing = globalThis.localStorage?.getItem(key)
    if (existing !== null && existing !== undefined) return existing
    const value = `pwa-${createRequestId()}`
    globalThis.localStorage?.setItem(key, value)
    return value
  }
}
