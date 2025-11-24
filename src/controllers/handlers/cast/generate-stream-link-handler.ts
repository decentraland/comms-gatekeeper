import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { validate } from '../../../logic/utils'
import { GenerateStreamLinkResult } from '../../../logic/cast/types'

export async function generateStreamLinkHandler(
  context: HandlerContextWithPath<'cast' | 'fetch' | 'config' | 'logs', '/cast/generate-stream-link'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { cast, logs }
  } = context

  const logger = logs.getLogger('generate-stream-link-handler')

  // Validate signed fetch and extract auth data
  const { identity, sceneId, realm, parcel, isWorld } = await validate(context)

  const realmName = realm.serverName

  // Validate required fields for Cast2 chat functionality
  if (!sceneId) {
    throw new InvalidRequestError('sceneId is required in authMetadata for Cast2 chat functionality')
  }

  let result: GenerateStreamLinkResult

  try {
    result = await cast.generateStreamLink({
      walletAddress: identity,
      worldName: isWorld ? realm.serverName : undefined,
      parcel,
      sceneId,
      realmName
    })
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return {
        status: 401,
        body: {
          error: error.message
        }
      }
    } else if (error instanceof InvalidRequestError) {
      return {
        status: 400,
        body: {
          error: error.message
        }
      }
    }
    logger.error(`Failed to generate stream link for ${identity} in ${realmName}`, { error: JSON.stringify(error) })
    return {
      status: 500,
      body: {
        error: 'Failed to generate stream link'
      }
    }
  }

  return {
    status: 200,
    body: result
  }
}
