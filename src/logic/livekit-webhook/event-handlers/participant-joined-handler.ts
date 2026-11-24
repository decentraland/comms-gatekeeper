import { Room, WebhookEvent } from 'livekit-server-sdk'
import { ILivekitWebhookEventHandler, RoomEventWithSession, WebhookEventName } from './types'
import { AppComponents } from '../../../types'
import { AnalyticsEvent } from '../../../types/analytics'
import { Events, RoomType, UserJoinedRoomEvent } from '@dcl/schemas'
import { getWebhookTimestamp, isRoomEventValid, isVoiceChatRoom } from './utils'

export function createParticipantJoinedHandler(
  components: Pick<AppComponents, 'voice' | 'analytics' | 'logs' | 'livekit' | 'publisher' | 'roomMetadataSync'>
): ILivekitWebhookEventHandler {
  const { livekit, logs, publisher, analytics, voice, roomMetadataSync } = components
  const logger = logs.getLogger('participant-joined-handler')

  async function publishUserJoinedRoomEvent(
    room: Room,
    userAddress: string,
    timestamp: number,
    sessionId: string
  ): Promise<void> {
    const { sceneId, worldName, realmName, roomType, communityId, voiceChatId, islandName } =
      livekit.getRoomMetadataFromRoomName(room.name)

    if (roomType === RoomType.UNKNOWN) {
      logger.warn(`Unknown room type for participant joined: ${room.name}`)
      return
    }

    // Do not publish events for preview realms (Creator Hub, local development).
    // Detection is by realm name only and intentionally independent of the
    // ALLOW_LOCAL_PREVIEW flag: preview sessions connect to production comms, so this
    // must suppress events even though that flag is disabled in production.
    if (livekit.isPreviewRealmName(realmName) || livekit.isPreviewRealmName(worldName)) {
      logger.debug(`Skipping UserJoinedRoomEvent for preview realm: ${realmName ?? worldName}`)
      return
    }

    const event: RoomEventWithSession<UserJoinedRoomEvent> = {
      type: Events.Type.COMMS,
      subType: Events.SubType.Comms.USER_JOINED_ROOM,
      key: `user-joined-room-${room.name}-${userAddress}`,
      timestamp,
      metadata: {
        sceneId: sceneId ?? '',
        userAddress,
        parcel: '',
        realmName: worldName ?? realmName ?? '',
        isWorld: !!worldName,
        voiceChatId,
        communityId,
        islandName,
        roomType,
        ...(sessionId ? { sessionId } : {})
      }
    }

    try {
      await publisher.publishMessages([event])
      logger.debug(`Published UserJoinedRoomEvent for ${userAddress} in room ${room.name}`)
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
      await voice.handleParticipantJoined(address, room.name, webhookEvent.participant?.sid)
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

      const address = participant.identity.toLowerCase().slice(0, 42)

      await Promise.all([
        publishUserJoinedRoomEvent(room, address, getWebhookTimestamp(webhookEvent), participant.sid),
        roomMetadataSync.updateRoomMetadataForRoom(room),
        analytics.fireEvent(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
          room: room.name,
          address
        }),
        handleParticipantJoinedVoiceChatRoom(webhookEvent, address)
      ])
    }
  }
}
