import { WebhookEvent } from 'livekit-server-sdk'
import { ILivekitWebhookEventHandler, WebhookEventName } from './types'
import { AppComponents } from '../../../types'
import { AnalyticsEvent } from '../../../types/analytics'
import { isRoomEventValid, isVoiceChatRoom } from './utils'
import { Events } from '@dcl/schemas'
import { UserJoinedRoomEvent } from '@dcl/schemas'

export function createParticipantJoinedHandler(
  components: Pick<AppComponents, 'voice' | 'analytics' | 'logs' | 'livekit' | 'publisher'>
): ILivekitWebhookEventHandler {
  const logger = components.logs.getLogger('participant-joined-handler')

  return {
    eventName: WebhookEventName.PARTICIPANT_JOINED,
    handle: async (webhookEvent: WebhookEvent) => {
      // Check if the room and participant data are valid
      if (!isRoomEventValid(webhookEvent)) {
        return
      }
      const { room, participant } = webhookEvent

      const address = participant.identity.toLowerCase()
      const { sceneId, worldName, realmName } = components.livekit.getSceneRoomMetadataFromRoomName(room.name)

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
          await components.publisher.publishMessages([event])
          logger.debug(`Published UserJoinedRoomEvent for ${address} in room ${room.name}`)
        } catch (error: any) {
          logger.error(`Failed to publish UserJoinedRoomEvent: ${error}`, {
            error,
            event: JSON.stringify(event),
            room: room.name
          })
        }
      }

      components.analytics.fireEvent(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
        room: room.name,
        address
      })

      if (isVoiceChatRoom(webhookEvent)) {
        logger.debug(`Participant ${address} joined voice chat room ${room.name}`)
        await components.voice.handleParticipantJoined(address, room.name)
      }
    }
  }
}
