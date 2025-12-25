import { Room, WebhookEvent } from 'livekit-server-sdk'
import { ILivekitWebhookEventHandler, WebhookEventName } from './types'
import { AppComponents } from '../../../types'
import { AnalyticsEvent } from '../../../types/analytics'
import { isRoomEventValid, isVoiceChatRoom } from './utils'
import { Events, RoomType } from '@dcl/schemas'
import { UserJoinedRoomEvent } from '@dcl/schemas'

export function createParticipantJoinedHandler(
  components: Pick<AppComponents, 'voice' | 'analytics' | 'logs' | 'livekit' | 'publisher' | 'sceneBans'>
): ILivekitWebhookEventHandler {
  const { livekit, logs, publisher, analytics, voice, sceneBans } = components
  const logger = logs.getLogger('participant-joined-handler')

  async function publishUserJoinedRoomEvent(room: Room, address: string): Promise<void> {
    const { sceneId, worldName, realmName, roomType, communityId, voiceChatId, islandName } =
      livekit.getRoomMetadataFromRoomName(room.name)

    if (roomType === RoomType.UNKNOWN) {
      logger.warn(`Unknown room type for participant joined: ${room.name}`)
      return
    }

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
        isWorld: !!worldName,
        voiceChatId,
        communityId,
        islandName,
        roomType
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
  }

  async function handleParticipantJoinedVoiceChatRoom(
    webhookEvent: WebhookEvent & { room: NonNullable<WebhookEvent['room']> },
    address: string
  ): Promise<void> {
    const { room } = webhookEvent

    if (isVoiceChatRoom(webhookEvent)) {
      logger.debug(`Participant ${address} joined voice chat room ${room.name}`)
      await voice.handleParticipantJoined(address, room.name)
    }
  }

  return {
    eventName: WebhookEventName.PARTICIPANT_JOINED,
    handle: async (webhookEvent: WebhookEvent) => {
      // Check if the room and participant data are valid
      if (!isRoomEventValid(webhookEvent)) {
        return
      }
      const { room, participant } = webhookEvent

      const address = participant.identity.toLowerCase()

      await Promise.all([
        publishUserJoinedRoomEvent(room, address),
        sceneBans.updateRoomMetadataWithBans(room),
        analytics.fireEvent(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
          room: room.name,
          address
        }),
        handleParticipantJoinedVoiceChatRoom(webhookEvent, address)
      ])
    }
  }
}
