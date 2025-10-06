import { WebhookEvent } from 'livekit-server-sdk'
import { ILivekitWebhookEventHandler, WebhookEventName } from './types'
import { AppComponents } from '../../../types'
import { AnalyticsEvent } from '../../../types/analytics'
import { isRoomEventValid, isVoiceChatRoom } from './utils'
import { Events } from '@dcl/schemas'
import { UserJoinedRoomEvent } from '@dcl/schemas'
import { isErrorWithMessage } from '../../errors'
import { PlaceAttributes } from '../../../types/places.type'

export function createParticipantJoinedHandler(
  components: Pick<
    AppComponents,
    'voice' | 'analytics' | 'logs' | 'livekit' | 'publisher' | 'places' | 'contentClient' | 'sceneBanManager'
  >
): ILivekitWebhookEventHandler {
  const { livekit, sceneBanManager, places, contentClient, logs, publisher, analytics, voice } = components
  const logger = logs.getLogger('participant-joined-handler')

  return {
    eventName: WebhookEventName.PARTICIPANT_JOINED,
    handle: async (webhookEvent: WebhookEvent) => {
      // Check if the room and participant data are valid
      if (!isRoomEventValid(webhookEvent)) {
        return
      }
      const { room, participant } = webhookEvent

      const address = participant.identity.toLowerCase()
      const { sceneId, worldName, realmName } = livekit.getSceneRoomMetadataFromRoomName(room.name)

      if (sceneId || worldName) {
        const event: UserJoinedRoomEvent = {
          type: Events.Type.COMMS,
          subType: Events.SubType.Comms.USER_JOINED_ROOM,
          key: `user-joined-room-${room.name}`,
          timestamp: Date.now(),
          metadata: {
            sceneId: sceneId ?? '',
            userAddress: address,
            parcel: '',
            realmName: worldName ?? realmName ?? '',
            isWorld: !!worldName
          }
        }

        try {
          await publisher.publishMessages([event])
          logger.debug(`Published UserJoinedRoomEvent for ${address} in room ${room.name}`)
        } catch (error: any) {
          logger.error(`Failed to publish UserJoinedRoomEvent: ${error}`, {
            error,
            event: JSON.stringify(event),
            room: room.name
          })
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

          logger.debug(`Updating room metadata for room ${room.name} with  ${bannedAddresses.length} banned addresses`)

          await livekit.updateRoomMetadata(
            room.name,
            {
              bannedAddresses
            },
            room
          )
        } catch (error) {
          logger.error(`Error updating room metadata for room ${room.name}`, {
            error: isErrorWithMessage(error) ? error.message : 'Unknown error'
          })
        }
      }

      analytics.fireEvent(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
        room: room.name,
        address
      })

      if (isVoiceChatRoom(webhookEvent)) {
        logger.debug(`Participant ${address} joined voice chat room ${room.name}`)
        await voice.handleParticipantJoined(address, room.name)
      }
    }
  }
}
