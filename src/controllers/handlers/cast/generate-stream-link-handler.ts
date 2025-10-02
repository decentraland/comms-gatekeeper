import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function generateStreamLinkHandler(
  context: HandlerContextWithPath<'cast', '/cast/generate-stream-link'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { cast },
    request,
    verification
  } = context

  // Verify authentication (signed fetch)
  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const walletAddress = verification.auth

  let body: { worldName?: string; parcel?: string }
  try {
    body = await request.json()
  } catch (error) {
    throw new InvalidRequestError('Invalid JSON body')
  }

  // Call cast component to generate the stream link
  const result = await cast.generateStreamLink({
    walletAddress,
    worldName: body.worldName,
    parcel: body.parcel
  })

  return {
    status: 200,
    body: result
  }
}
