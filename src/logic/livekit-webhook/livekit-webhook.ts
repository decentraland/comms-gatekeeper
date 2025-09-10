import { WebhookEvent } from 'livekit-server-sdk'
import { ILivekitWebhookComponent } from './types'
import { ILivekitWebhookEventHandler, WebhookEventName } from './event-handlers/types'

export function createLivekitWebhookComponent(): ILivekitWebhookComponent {
  const eventHandlers = new Map<WebhookEventName, ILivekitWebhookEventHandler>()

  return {
    registerEventHandler: (handler: ILivekitWebhookEventHandler) => {
      eventHandlers.set(handler.eventName, handler)
    },
    handle: async (webhookEvent: WebhookEvent) => {
      const event = webhookEvent.event as WebhookEventName
      const handler = eventHandlers.get(event)

      if (handler) {
        await handler.handle(webhookEvent)
      }
    }
  }
}
