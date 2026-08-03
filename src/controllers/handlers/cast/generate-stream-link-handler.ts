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
    components: { cast, livekit, worlds, logs }
  } = context

  const logger = logs.getLogger('generate-stream-link-handler')

  // Validate signed fetch and extract auth data
  const { identity, sceneId, parcel, realm, isWorld } = await validate(context)

  const realmName = realm.serverName
  const isPreview = livekit.isLocalPreview(realmName)

  // Validate required fields for Cast2 chat functionality
  if (!sceneId) {
    throw new InvalidRequestError('sceneId is required in authMetadata for Cast2 chat functionality')
  }

  // The client may send the world name as the sceneId instead of the real content hash. Resolve
  // it to the actual entity id so both the LiveKit room name and the Place lookup use the same
  // hash the scene participants use (mirrors comms-scene-handler). Genesis scenes pass through.
  let resolvedSceneId = sceneId
  if (isWorld && sceneId.endsWith('.eth')) {
    try {
      resolvedSceneId = await worlds.fetchWorldSceneId(realmName, parcel)
    } catch (error) {
      logger.error(`Failed to resolve scene ID for world ${realmName}: ${error}`)
      throw new InvalidRequestError(`Failed to resolve scene ID for world ${realmName}`)
    }
  }

  const result = isPreview
    ? await cast.generatePreviewStreamLink({ sceneId: resolvedSceneId, realmName, walletAddress: identity })
    : await cast.generateStreamLink({
        walletAddress: identity,
        worldName: isWorld ? realm.serverName : undefined,
        sceneId: resolvedSceneId,
        realmName,
        parcel
      })

  return {
    status: 200,
    body: result
  }
}
