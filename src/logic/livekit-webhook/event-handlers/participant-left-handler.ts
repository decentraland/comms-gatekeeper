import { Events, RoomType, UserLeftRoomEvent } from '@dcl/schemas'
import { WebhookEvent } from 'livekit-server-sdk'
import { ILivekitWebhookEventHandler, WebhookEventName } from './types'
import { AppComponents } from '../../../types'
import { AnalyticsEvent } from '../../../types/analytics'
import { isRoomEventValid, isVoiceChatRoom } from './utils'

export function createParticipantLeftHandler(
  components: Pick<AppComponents, 'voice' | 'analytics' | 'logs' | 'livekit' | 'publisher'>
): ILivekitWebhookEventHandler {
  const logger = components.logs.getLogger('participant-left-handler')

  return {
    eventName: WebhookEventName.PARTICIPANT_LEFT,
    handle: async (webhookEvent: WebhookEvent) => {
      // Check if the room and participant data are valid
      if (!isRoomEventValid(webhookEvent)) {
        return
      }

      const { room, participant } = webhookEvent
      const { sceneId, worldName, realmName, communityId, voiceChatId, islandName, roomType } =
        components.livekit.getRoomMetadataFromRoomName(room.name)

      if (roomType === RoomType.UNKNOWN) {
        logger.warn(`Unknown room type for participant left: ${room.name}`)
        return
      }

      const event: UserLeftRoomEvent = {
        type: Events.Type.COMMS,
        subType: Events.SubType.Comms.USER_LEFT_ROOM,
        key: `user-left-room-${room.name}`,
        timestamp: Date.now(),
        metadata: {
          sceneId: sceneId,
          userAddress: participant.identity.toLowerCase(),
          isWorld: !!worldName,
          realmName: worldName || realmName || '',
          roomType,
          islandName,
          communityId,
          voiceChatId
        }
      }

      try {
        await components.publisher.publishMessages([event])
        logger.debug(`Published UserLeftRoomEvent for ${participant.identity} in room ${room}`)
      } catch (error: any) {
        logger.error(`Failed to publish UserLeftRoomEvent: ${error}`, {
          error,
          event: JSON.stringify(event),
          room: room.name
        })
      }

      components.analytics.fireEvent(AnalyticsEvent.PARTICIPANT_LEFT_ROOM, {
        room: room.name,
        address: participant.identity,
        reason: participant.disconnectReason.toString()
      })

      if (isVoiceChatRoom(webhookEvent)) {
        const disconnectReason = webhookEvent.participant.disconnectReason
        logger.debug(
          `Participant ${webhookEvent.participant.identity} left voice chat room ${webhookEvent.room.name} with reason ${disconnectReason}`
        )
        await components.voice.handleParticipantLeft(
          webhookEvent.participant.identity,
          webhookEvent.room.name,
          disconnectReason
        )
      }
    }
  }
}
