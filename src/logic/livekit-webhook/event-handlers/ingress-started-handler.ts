import { WebhookEvent } from 'livekit-server-sdk'
import { AppComponents } from '../../../types'
import { ILivekitWebhookEventHandler, WebhookEventName } from './types'

export function createIngressStartedHandler(
  components: Pick<AppComponents, 'sceneStreamAccessManager'>
): ILivekitWebhookEventHandler {
  return {
    eventName: WebhookEventName.INGRESS_STARTED,
    handle: async (webhookEvent: WebhookEvent) => {
      if (!webhookEvent.ingressInfo) {
        return
      }

      // Always invalidate in-flight reconciliation, even when a missed end event left
      // streaming=true. The manager preserves an already-running stream's TTL clock.
      await components.sceneStreamAccessManager.startStreaming(webhookEvent.ingressInfo.ingressId)
    }
  }
}
