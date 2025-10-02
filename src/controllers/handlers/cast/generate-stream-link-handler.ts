import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'

export async function generateStreamLinkHandler(
  context: HandlerContextWithPath<'logs' | 'cast', '/cast/generate-stream-link'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, cast },
    request,
    verification
  } = context

  const logger = logs.getLogger('generate-stream-link-handler')

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

  try {
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
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof InvalidRequestError) {
      throw error
    }

    logger.error(`Failed to generate stream link: ${(error as Error).message}`)
    throw new InvalidRequestError('Failed to generate stream link')
  }
}
