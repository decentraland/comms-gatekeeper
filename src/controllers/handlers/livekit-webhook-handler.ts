import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath } from '../../types'
import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '../../types/errors'

export async function livekitWebhookHandler(
  ctx: HandlerContextWithPath<'livekit' | 'livekitWebhook', '/livekit-webhook'> & DecentralandSignatureContext<any>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { livekit, livekitWebhook },
    request
  } = ctx

  const body = await request.text()
  const authorization = request.headers.get('Authorization') || ''

  if (!authorization) {
    throw new InvalidRequestError('Authorization header not found')
  }

  const webhookEvent = await livekit.getWebhookEvent(body, authorization)

  await livekitWebhook.handle(webhookEvent)

  return {
    status: 200,
    body
  }
}
