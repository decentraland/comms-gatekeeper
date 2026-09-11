import { IBaseComponent } from '@well-known-components/interfaces'

/** Must not throw — an escaping throw halts delivery for every subject on the connection. */
export type NatsMessageHandler = (subject: string, data: Uint8Array) => void

export type NatsSubscribeOptions = {
  queue?: string
}

export type INatsComponent = IBaseComponent & {
  /**
   * Opens the connection to the broker and activates every registered subscription.
   *
   * Concurrent calls share a single in-flight attempt.
   *
   * @returns A promise that resolves once the attempt settles. Never rejects: a no-op when
   * `NATS_URL` is unset, and on failure it schedules a background retry instead of throwing.
   */
  connect(): Promise<void>
  /**
   * Registers a handler for a subject. Safe to call before `connect()` — registrations made
   * while disconnected are activated as soon as the connection opens.
   *
   * @param subject - The subject to subscribe to, wildcards included.
   * @param handler - Invoked per message. Must not throw; an escaping throw is caught and logged.
   * @param options - Optional queue group, so exactly one member of the group handles each message.
   */
  subscribe(subject: string, handler: NatsMessageHandler, options?: NatsSubscribeOptions): void
  /**
   * Publishes a message.
   *
   * @param subject - The subject to publish on.
   * @param data - The already-encoded payload.
   * @returns `true` when the message was handed to the client — which includes a
   * disconnect/reconnect blip, where it is buffered and flushed on reconnect — and `false`
   * when there was no connection to hand it to and it was dropped. Callers that report on
   * delivery must check this: a dropped publish does not throw.
   */
  publish(subject: string, data: Uint8Array): boolean
  /**
   * Whether NATS is configured at all, i.e. whether `NATS_URL` is set. Independent of whether
   * the link is currently up — callers use this to decide whether to bother wiring themselves in.
   */
  isEnabled(): boolean
  /** Whether the link is currently up. False during a disconnect/reconnect blip. */
  isConnected(): boolean
}
