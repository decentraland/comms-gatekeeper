import { WebhookEvent } from 'livekit-server-sdk'
import { ILivekitWebhookEventHandler, WebhookEventName } from './types'
import { AppComponents } from '../../../types'

export function createRoomStartedHandler(
  components: Pick<AppComponents, 'livekit' | 'sceneBans'>
): ILivekitWebhookEventHandler {
  const { livekit, sceneBans } = components

  return {
    eventName: WebhookEventName.ROOM_STARTED,
    handle: async (webhookEvent: WebhookEvent) => {
      if (!webhookEvent.room) {
        return
      }
    }
  }
}
