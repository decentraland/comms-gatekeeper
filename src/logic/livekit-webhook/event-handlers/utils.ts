import { WebhookEvent } from 'livekit-server-sdk'

// Realm names that indicate a preview/local development environment
// These should not generate events for credits or other production features
const PREVIEW_REALM_NAMES = ['preview', 'localpreview']

export function isVoiceChatRoom(webhookEvent: WebhookEvent): boolean {
  return webhookEvent.room?.name?.startsWith('voice-chat') ?? false
}

/**
 * Checks if the realm name indicates a preview/local development environment
 * @param realmName - The realm name to check
 * @returns true if the realm is a preview realm
 */
export function isPreviewRealm(realmName: string | undefined): boolean {
  if (!realmName) {
    return false
  }
  return PREVIEW_REALM_NAMES.includes(realmName.toLowerCase())
}

export function isRoomEventValid(webhookEvent: WebhookEvent): webhookEvent is WebhookEvent & {
  room: NonNullable<WebhookEvent['room']>
  participant: NonNullable<WebhookEvent['participant']>
} {
  return !!webhookEvent.room?.name && !!webhookEvent.participant?.identity
}
