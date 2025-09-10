import { WebhookEvent } from 'livekit-server-sdk'
import { ILivekitWebhookEventHandler, WebhookEventName } from './types'
import { AppComponents } from '../../../types'
import { PlaceAttributes } from '../../../types/places.type'
import { isErrorWithMessage } from '../../../logic/errors'

export function createRoomStartedHandler(
  components: Pick<AppComponents, 'livekit' | 'sceneBanManager' | 'places' | 'contentClient' | 'logs'>
): ILivekitWebhookEventHandler {
  const { livekit, sceneBanManager, places, contentClient, logs } = components

  const logger = logs.getLogger('room-started-handler')

  return {
    eventName: WebhookEventName.ROOM_STARTED,
    handle: async (webhookEvent: WebhookEvent) => {
      if (!webhookEvent.room) {
        return
      }

      const { sceneId, worldName } = livekit.getSceneRoomMetadataFromRoomName(webhookEvent.room.name)

      if (!sceneId && !worldName) {
        return
      }

      try {
        let place: PlaceAttributes

        if (worldName) {
          place = await places.getPlaceByWorldName(worldName)
        } else {
          // TODO: we could retry if fails
          const entity = await contentClient.fetchEntityById(sceneId!)
          place = await places.getPlaceByParcel(entity.metadata.scene.base)
        }

        const bannedAddresses = await sceneBanManager.listBannedAddresses(place.id)

        await livekit.updateRoomMetadata(webhookEvent.room.name, {
          bannedAddresses
        })
      } catch (error) {
        logger.error('Error in room-started handler:', {
          error: isErrorWithMessage(error) ? error.message : 'Unknown error'
        })
      }
    }
  }
}
