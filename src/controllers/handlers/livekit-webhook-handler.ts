import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath } from '../../types'
import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '../../types/errors'
import { WebhookEventNames } from 'livekit-server-sdk'
import { AnalyticsEvent } from '../../types/analytics'

export async function livekitWebhookHandler(
  ctx: HandlerContextWithPath<
    'logs' | 'livekit' | 'sceneStreamAccessManager' | 'voice' | 'analytics',
    '/livekit-webhook'
  > &
    DecentralandSignatureContext<any>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, livekit, sceneStreamAccessManager, voice, analytics },
    request
  } = ctx
  const logger = logs.getLogger('livekit-webhook')

  const body = await request.text()
  const authorization = request.headers.get('Authorization') || ''

  if (!authorization) {
    throw new InvalidRequestError('Authorization header not found')
  }

  const webhookEvent = await livekit.getWebhookEvent(body, authorization)

  const event = webhookEvent.event as WebhookEventNames
  const isVoiceChatRoom = webhookEvent.room?.name.startsWith('voice-chat')

  if (event === 'ingress_started' && webhookEvent.ingressInfo) {
    const isStreaming = await sceneStreamAccessManager.isStreaming(webhookEvent.ingressInfo.ingressId)
    if (!isStreaming) {
      await sceneStreamAccessManager.startStreaming(webhookEvent.ingressInfo.ingressId)
    }
  } else if (event === 'ingress_ended' && webhookEvent.ingressInfo) {
    await sceneStreamAccessManager.stopStreaming(webhookEvent.ingressInfo.ingressId)
  } else if (event === 'participant_joined') {
    analytics.fireEvent(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
      room: webhookEvent.room?.name ?? 'Unknown',
      address: webhookEvent.participant?.identity ?? 'Unknown'
    })

    if (isVoiceChatRoom) {
      if (!webhookEvent.participant?.identity) {
        throw new InvalidRequestError("LiveKit didn't provide an identity for the participant")
      }
      if (!webhookEvent.room?.name) {
        throw new InvalidRequestError("LiveKit didn't provide a room name for the participant")
      }

      logger.debug(`Participant ${webhookEvent.participant.identity} joined voice chat room ${webhookEvent.room.name}`)

      await voice.handleParticipantJoined(webhookEvent.participant.identity, webhookEvent.room.name)
    }
  } else if (event === 'participant_left') {
    analytics.fireEvent(AnalyticsEvent.PARTICIPANT_LEFT_ROOM, {
      room: webhookEvent.room?.name ?? 'Unknown',
      address: webhookEvent.participant?.identity ?? 'Unknown'
    })

    if (isVoiceChatRoom) {
      if (!webhookEvent.participant?.identity) {
        throw new InvalidRequestError("LiveKit didn't provide an identity for the participant")
      }
      if (!webhookEvent.room?.name) {
        throw new InvalidRequestError("LiveKit didn't provide a room name for the participant")
      }

      const disconnectReason = webhookEvent.participant.disconnectReason
      logger.debug(
        `Participant ${webhookEvent.participant.identity} left voice chat room ${webhookEvent.room.name} with reason ${disconnectReason}`
      )

      await voice.handleParticipantLeft(webhookEvent.participant.identity, webhookEvent.room.name, disconnectReason)
    }
  }

  return {
    status: 200,
    body
  }
}
