import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'
import { validate } from '../../../logic/utils'

export async function generateStreamLinkHandler(
  context: HandlerContextWithPath<'cast' | 'fetch' | 'config', '/cast/generate-stream-link'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { cast }
  } = context

  // Validate signed fetch and extract auth data
  const { identity, sceneId, realm, parcel, isWorld } = await validate(context)

  const realmName = realm.serverName

  // Validate required fields for Cast2 chat functionality
  if (!sceneId) {
    throw new InvalidRequestError('sceneId is required in authMetadata for Cast2 chat functionality')
  }

  // Call cast component to generate the stream link
  const result = await cast.generateStreamLink({
    walletAddress: identity,
    worldName: isWorld ? realm.serverName : undefined,
    parcel,
    sceneId,
    realmName
  })

  return {
    status: 200,
    body: result
  }
}
