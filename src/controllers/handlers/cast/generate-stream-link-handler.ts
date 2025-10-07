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

  // Extract scene_id and realm_name from authMetadata for chat room access
  const sceneId = verification.authMetadata?.sceneId
  const realmName = verification.authMetadata?.realm?.serverName

  // Validate required fields for Cast2 chat functionality
  if (!sceneId || !realmName) {
    throw new InvalidRequestError('sceneId and realmName are required in authMetadata for Cast2 chat functionality')
  }

  // Call cast component to generate the stream link
  const result = await cast.generateStreamLink({
    walletAddress,
    worldName: body.worldName,
    parcel: body.parcel,
    sceneId,
    realmName
  })

  return {
    status: 200,
    body: result
  }
}
