import { WebhookEvent } from 'livekit-server-sdk'
import { ILivekitWebhookEventHandler, WebhookEventName } from './types'
import { AppComponents } from '../../../types'
import { AnalyticsEvent } from '../../../types/analytics'
import { isRoomEventValid, isVoiceChatRoom } from './utils'

export function createParticipantJoinedHandler(
  components: Pick<AppComponents, 'voice' | 'analytics' | 'logs'>
): ILivekitWebhookEventHandler {
  const logger = components.logs.getLogger('participant-joined-handler')

  return {
    eventName: WebhookEventName.PARTICIPANT_JOINED,
    handle: async (webhookEvent: WebhookEvent) => {
      const { room, participant } = webhookEvent

      components.analytics.fireEvent(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
        room: room?.name ?? 'Unknown',
        address: participant?.identity ?? 'Unknown'
      })

      if (isVoiceChatRoom(webhookEvent) && isRoomEventValid(webhookEvent)) {
        logger.debug(
          `Participant ${webhookEvent.participant.identity} joined voice chat room ${webhookEvent.room.name}`
        )
        await components.voice.handleParticipantJoined(webhookEvent.participant.identity, webhookEvent.room.name)
      }
    }
  }
}
