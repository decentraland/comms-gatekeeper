import { IBaseComponent } from '@well-known-components/interfaces'

/** Must not throw — an escaping throw halts delivery for every subject on the connection. */
export type NatsMessageHandler = (subject: string, data: Uint8Array) => void

export type NatsSubscribeOptions = {
  queue?: string
}

export type INatsComponent = IBaseComponent & {
  /** No-op when `NATS_URL` is unset. Never throws — retries in the background on failure. */
  connect(): Promise<void>
  subscribe(subject: string, handler: NatsMessageHandler, options?: NatsSubscribeOptions): void
  /** No-op while disconnected. */
  publish(subject: string, data: Uint8Array): void
  isConnected(): boolean
}
