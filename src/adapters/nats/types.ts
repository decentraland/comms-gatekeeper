import { IBaseComponent } from '@well-known-components/interfaces'

/** Must not throw — an escaping throw halts delivery for every subject on the connection. */
export type NatsMessageHandler = (subject: string, data: Uint8Array) => void

export type NatsSubscribeOptions = {
  queue?: string
}

export type NatsSubscription = {
  /**
   * Stops delivering to the handler: drops the registration, so a later reconnect does not
   * restore it, and cancels the live subscription when the link is up. Safe to call more than
   * once, and before the connection has ever opened.
   */
  unsubscribe(): void
}

/** How a confirmed publish ended. */
export type PublishOutcome =
  /** The broker answered a round trip issued after the write, so it has processed the message. */
  | 'confirmed'
  /** The write reached a connected client, but the broker's answer did not arrive within the deadline. */
  | 'unconfirmed'
  /** The write never reached the broker: no connection, a failed flush, or a disconnect before the answer. */
  | 'dropped'

/** How a request ended. */
export type NatsRequestResult =
  | { status: 'replied'; data: Uint8Array }
  /** The subject has subscribers, but none replied within the deadline. */
  | { status: 'no_reply' }
  /** No connection, no subscriber for the subject, or the request itself failed. */
  | { status: 'unavailable' }

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
   * @returns A handle to cancel the subscription with.
   */
  subscribe(subject: string, handler: NatsMessageHandler, options?: NatsSubscribeOptions): NatsSubscription
  /**
   * Publishes a message.
   *
   * @param subject - The subject to publish on.
   * @param data - The already-encoded payload.
   * @returns True only when handed to a connected client. Core NATS does not replay messages.
   */
  publish(subject: string, data: Uint8Array): boolean
  /**
   * Publishes a message and awaits one broker round trip issued after the write, bounded by a
   * deadline. A broker answer is not a subscriber acknowledgement: Core NATS is at-most-once.
   *
   * @param subject - The subject to publish on.
   * @param data - The already-encoded payload.
   * @returns Whether the broker processed the write, could not be seen to within the deadline, or never got it.
   */
  publishConfirmed(subject: string, data: Uint8Array): Promise<PublishOutcome>
  /**
   * Sends a request and awaits its reply, bounded by a deadline.
   *
   * @param subject - The subject to request on.
   * @param data - The request payload.
   * @returns The reply, or whether the subject went unanswered or could not be reached at all.
   */
  request(subject: string, data: Uint8Array): Promise<NatsRequestResult>
  /**
   * Whether NATS is configured at all, i.e. whether `NATS_URL` is set. Independent of whether
   * the link is currently up — callers use this to decide whether to bother wiring themselves in.
   */
  isEnabled(): boolean
  /** Whether the link is currently up. False during a disconnect/reconnect blip. */
  isConnected(): boolean
}
