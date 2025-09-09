import { WebhookEvent } from 'livekit-server-sdk'
import { ILivekitWebhookEventHandler } from './event-handlers'

export interface ILivekitWebhookComponent {
  /**
   * Registers a new event handler
   * @param handler - The event handler to register
   */
  registerEventHandler(handler: ILivekitWebhookEventHandler): void

  /**
   * Handles webhook events from LiveKit
   * @param webhookEvent - The webhook event from LiveKit
   */
  handle(webhookEvent: WebhookEvent): Promise<void>
}
