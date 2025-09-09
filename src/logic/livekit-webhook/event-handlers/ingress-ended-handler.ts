import { WebhookEvent } from 'livekit-server-sdk'
import { ILivekitWebhookEventHandler, WebhookEventName } from './types'
import { AppComponents } from '../../../types'

export function createIngressEndedHandler(
  components: Pick<AppComponents, 'sceneStreamAccessManager'>
): ILivekitWebhookEventHandler {
  return {
    eventName: WebhookEventName.INGRESS_ENDED,
    handle: async (webhookEvent: WebhookEvent) => {
      if (!webhookEvent.ingressInfo) {
        return
      }

      await components.sceneStreamAccessManager.stopStreaming(webhookEvent.ingressInfo.ingressId)
    }
  }
}
