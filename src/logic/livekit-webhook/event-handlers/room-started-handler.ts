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

      logger.info('Room started handler', {
        room: webhookEvent.room.name
      })

      const { sceneId, worldName } = livekit.getSceneRoomMetadataFromRoomName(webhookEvent.room.name)

      logger.debug('Scene room metadata from room name', {
        sceneId: sceneId ?? 'undefined',
        worldName: worldName ?? 'undefined'
      })

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

        logger.debug(`Retrieving banned addresses for place ${place.id}`)

        const bannedAddresses = await sceneBanManager.listBannedAddresses(place.id)

        logger.debug(
          `Updating room metadata for room ${webhookEvent.room.name} with  ${bannedAddresses.length} banned addresses`
        )

        await livekit.updateRoomMetadata(
          webhookEvent.room.name,
          {
            bannedAddresses
          },
          webhookEvent.room
        )
      } catch (error) {
        logger.error('Error in room-started handler:', {
          error: isErrorWithMessage(error) ? error.message : 'Unknown error'
        })
      }
    }
  }
}
