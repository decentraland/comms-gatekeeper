import { WebhookEvent } from 'livekit-server-sdk'

/**
 * Returns the room event occurrence time in milliseconds. LiveKit supplies Unix seconds.
 * Older webhook payloads without a usable timestamp fall back to the processing time.
 */
export function getWebhookTimestamp(webhookEvent: WebhookEvent): number {
  const createdAt = Number(webhookEvent.createdAt)
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    return Date.now()
  }
  return createdAt < 1e12 ? createdAt * 1000 : createdAt
}

export function isVoiceChatRoom(webhookEvent: WebhookEvent): boolean {
  return webhookEvent.room?.name?.startsWith('voice-chat') ?? false
}

export function isRoomEventValid(webhookEvent: WebhookEvent): webhookEvent is WebhookEvent & {
  room: NonNullable<WebhookEvent['room']>
  participant: NonNullable<WebhookEvent['participant']>
} {
  return !!webhookEvent.room?.name && !!webhookEvent.participant?.identity
}
