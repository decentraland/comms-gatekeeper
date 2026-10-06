import { resolveWorldSceneId } from '../../../logic/world-scene'
import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'
import { validate } from '../../../logic/utils'

export async function generateStreamLinkHandler(
  context: HandlerContextWithPath<
    'cast' | 'fetch' | 'config' | 'logs' | 'livekit' | 'worlds',
    '/cast/generate-stream-link'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { cast, livekit, worlds }
  } = context

  // Validate signed fetch and extract auth data
  const { identity, sceneId, realm, isWorld, deviceIdentifier } = await validate(context)

  const realmName = realm.serverName
  const isPreview = livekit.isLocalPreview(realmName)

  // Validate required fields for Cast2 chat functionality
  if (!sceneId) {
    throw new InvalidRequestError('sceneId is required in authMetadata for Cast2 chat functionality')
  }

  const resolvedSceneId = isWorld ? await resolveWorldSceneId(worlds, realmName, sceneId) : sceneId

  const result = isPreview
    ? await cast.generatePreviewStreamLink({
        sceneId: resolvedSceneId,
        realmName,
        walletAddress: identity,
        deviceIdentifier
      })
    : await cast.generateStreamLink({
        walletAddress: identity,
        worldName: isWorld ? realm.serverName : undefined,
        sceneId: resolvedSceneId,
        realmName,
        deviceIdentifier
      })

  return {
    status: 200,
    body: result
  }
}
