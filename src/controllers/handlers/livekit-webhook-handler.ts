import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath } from '../../types'
import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '../../types/errors'
export async function livekitWebhookHandler(
  ctx: HandlerContextWithPath<'logs' | 'livekit', '/livekit-webhook'> & DecentralandSignatureContext<any>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, livekit },
    request
  } = ctx

  const body = await request.text()
  const authorization = request.headers.get('Authorization') || ''

  if (!authorization) {
    throw new InvalidRequestError('Authorization header not found')
  }

  const webhookEvent = await livekit.getWebhookEvent(body, authorization)

  if (
    webhookEvent &&
    (webhookEvent.room?.name === 'dev-brai.dcl.eth' || webhookEvent.event?.toLowerCase().includes('ingress'))
  ) {
    const logger = logs.getLogger('livekit-webhook')
    logger.debug(` >>> webhookEvent`)
    logger.debug(JSON.stringify(webhookEvent))
  }

  return {
    status: 200,
    body
  }
}
