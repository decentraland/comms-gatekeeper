import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath } from '../../types'
import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '../../types/errors'
import { WebhookEventNames } from 'livekit-server-sdk'
import { WebhookEventName } from '../../adapters/livekit'
import { Event } from '../../adapters/data-warehouse-client'

const WEBHOOK_EVENTS_TO_SEND_TO_DATA_WAREHOUSE: Partial<Record<WebhookEventNames, Event['event']>> = {
  [WebhookEventName.ParticipantJoined]: 'peer_joined_room',
  [WebhookEventName.ParticipantLeft]: 'peer_left_room'
}

export async function livekitWebhookHandler(
  ctx: HandlerContextWithPath<
    'logs' | 'livekit' | 'sceneStreamAccessManager' | 'dataWarehouseClient',
    '/livekit-webhook'
  > &
    DecentralandSignatureContext<any>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, livekit, sceneStreamAccessManager, dataWarehouseClient },
    request
  } = ctx

  const body = await request.text()
  const authorization = request.headers.get('Authorization') || ''

  if (!authorization) {
    throw new InvalidRequestError('Authorization header not found')
  }

  const webhookEvent = await livekit.getWebhookEvent(body, authorization)

  const dataWarehouseEvent = WEBHOOK_EVENTS_TO_SEND_TO_DATA_WAREHOUSE[webhookEvent.event]
  if (dataWarehouseEvent) {
    const { participant } = webhookEvent

    setImmediate(async () => {
      await dataWarehouseClient.sendEvent({
        context: 'notification_server',
        event: dataWarehouseEvent,
        body: {
          address: participant?.identity
        }
      })
    })
  }

  if (
    webhookEvent &&
    (webhookEvent.room?.name === 'dev-brai.dcl.eth' || webhookEvent.event?.toLowerCase().includes('ingress'))
  ) {
    const logger = logs.getLogger('livekit-webhook')
    logger.debug(` >>> webhookEvent`)
    logger.debug(JSON.stringify(webhookEvent))
  }

  const event = webhookEvent.event as WebhookEventNames

  if (event === WebhookEventName.IngressStarted && webhookEvent.ingressInfo) {
    const isStreaming = await sceneStreamAccessManager.isStreaming(webhookEvent.ingressInfo.ingressId)
    if (!isStreaming) {
      await sceneStreamAccessManager.startStreaming(webhookEvent.ingressInfo.ingressId)
    }
  } else if (event === WebhookEventName.IngressEnded && webhookEvent.ingressInfo) {
    await sceneStreamAccessManager.stopStreaming(webhookEvent.ingressInfo.ingressId)
  }

  return {
    status: 200,
    body
  }
}
