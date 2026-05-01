import { WebhookEvent } from 'livekit-server-sdk'
import { ILivekitWebhookEventHandler, WebhookEventName } from './types'
import { AppComponents } from '../../../types'

export function createRoomStartedHandler(
  components: Pick<AppComponents, 'roomMetadataSync' | 'logs'>
): ILivekitWebhookEventHandler {
  const { roomMetadataSync, logs } = components

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

      await roomMetadataSync.updateRoomMetadataForRoom(webhookEvent.room)
    }
  }
}
