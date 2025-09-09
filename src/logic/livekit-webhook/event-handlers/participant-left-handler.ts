import { WebhookEvent } from 'livekit-server-sdk'
import { ILivekitWebhookEventHandler, WebhookEventName } from './types'
import { AppComponents } from '../../../types'
import { AnalyticsEvent } from '../../../types/analytics'
import { isRoomEventValid, isVoiceChatRoom } from './utils'

export function createParticipantLeftHandler(
  components: Pick<AppComponents, 'voice' | 'analytics' | 'logs'>
): ILivekitWebhookEventHandler {
  const logger = components.logs.getLogger('participant-left-handler')

  return {
    eventName: WebhookEventName.PARTICIPANT_LEFT,
    handle: async (webhookEvent: WebhookEvent) => {
      const { room, participant } = webhookEvent

      components.analytics.fireEvent(AnalyticsEvent.PARTICIPANT_LEFT_ROOM, {
        room: room?.name ?? 'Unknown',
        address: participant?.identity ?? 'Unknown',
        reason: (participant?.disconnectReason ?? 'Unknown').toString()
      })

      if (isVoiceChatRoom(webhookEvent) && isRoomEventValid(webhookEvent)) {
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
