import { WebhookEvent } from 'livekit-server-sdk'

export enum WebhookEventName {
  INGRESS_STARTED = 'ingress_started',
  INGRESS_ENDED = 'ingress_ended',
  PARTICIPANT_JOINED = 'participant_joined',
  PARTICIPANT_LEFT = 'participant_left',
  ROOM_STARTED = 'room_started'
}

export interface ILivekitWebhookEventHandler {
  eventName: WebhookEventName

  /**
   * Handles webhook events from LiveKit
   * @param webhookEvent - The webhook event from LiveKit
   */
  handle(webhookEvent: WebhookEvent): Promise<void>
}
