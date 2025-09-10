import { WebhookEvent } from 'livekit-server-sdk'

export function isVoiceChatRoom(webhookEvent: WebhookEvent): boolean {
  return webhookEvent.room?.name?.startsWith('voice-chat') ?? false
}

export function isRoomEventValid(webhookEvent: WebhookEvent): webhookEvent is WebhookEvent & {
  room: NonNullable<WebhookEvent['room']>
  participant: NonNullable<WebhookEvent['participant']>
} {
  return !!webhookEvent.room?.name && !!webhookEvent.participant?.identity
}
