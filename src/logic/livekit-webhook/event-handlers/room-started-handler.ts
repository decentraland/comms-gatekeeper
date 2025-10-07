import { WebhookEvent } from 'livekit-server-sdk'
import { ILivekitWebhookEventHandler, WebhookEventName } from './types'
import { AppComponents } from '../../../types'

export function createRoomStartedHandler(
  components: Pick<AppComponents, 'sceneBans' | 'logs'>
): ILivekitWebhookEventHandler {
  const { sceneBans, logs } = components

  const logger = logs.getLogger('room-started-handler')

  return {
    eventName: WebhookEventName.ROOM_STARTED,
    handle: async (webhookEvent: WebhookEvent) => {
      if (!webhookEvent.room) {
        return
      }

      logger.info('Room started handler', {
        room: webhookEvent.room.name
      })

      await sceneBans.updateRoomMetadataWithBans(webhookEvent.room)
    }
  }
}
