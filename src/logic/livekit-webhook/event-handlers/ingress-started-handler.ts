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

      const isStreaming = await components.sceneStreamAccessManager.isStreaming(webhookEvent.ingressInfo.ingressId)

      if (!isStreaming) {
        await components.sceneStreamAccessManager.startStreaming(webhookEvent.ingressInfo.ingressId)
      }
    }
  }
}
