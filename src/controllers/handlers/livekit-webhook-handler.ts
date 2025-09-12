import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath } from '../../types'
import { WebhookEvent } from 'livekit-server-sdk'
import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '../../types/errors'

export async function livekitWebhookHandler(
  ctx: HandlerContextWithPath<'livekit' | 'livekitWebhook' | 'logs', '/livekit-webhook'> &
    DecentralandSignatureContext<any>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { livekit, livekitWebhook, logs },
    request
  } = ctx

  const body = await request.text()
  const authorization = request.headers.get('Authorization') || ''
  const logger = logs.getLogger('livekit-webhook-handler')

  if (!authorization) {
    throw new InvalidRequestError('Authorization header not found')
  }

  let webhookEvent: WebhookEvent
  try {
    webhookEvent = await livekit.getWebhookEvent(body, authorization)
  } catch (error) {
    logger.error('Invalid webhook event', { error: (error as Error).message })
    throw new InvalidRequestError('Invalid webhook event')
  }

  try {
    await livekitWebhook.handle(webhookEvent)
  } catch (error) {
    logger.error('Error handling webhook event', { error: (error as Error).message })
    throw new InvalidRequestError('Error handling webhook event')
  }

  return {
    status: 200,
    body
  }
}
