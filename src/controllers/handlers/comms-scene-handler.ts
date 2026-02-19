import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath, Permissions } from '../../types'
import { ForbiddenError, InvalidRequestError, NotFoundError, UnauthorizedError } from '../../types/errors'
import { oldValidate } from '../../logic/utils'

export async function commsSceneHandler(
  context: HandlerContextWithPath<
    'fetch' | 'config' | 'livekit' | 'logs' | 'denyList' | 'sceneBans' | 'places' | 'worlds',
    '/get-scene-adapter'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { livekit, logs, denyList, sceneBans, worlds }
  } = context

  const logger = logs.getLogger('comms-scene-handler')
  const { sceneId, identity, parcel, realmName } = await oldValidate(context)

  let forPreview = false
  let room: string
  const permissions: Permissions = {
    cast: [],
    mute: []
  }

  const isDenylisted = await denyList.isDenylisted(identity)
  if (isDenylisted) {
    logger.warn(`Rejected connection from deny-listed wallet: ${identity}`)
    throw new UnauthorizedError('Access denied, deny-listed wallet')
  }

  const isWorld = realmName.endsWith('.eth')

  if (!livekit.isLocalPreview(realmName) && !sceneId) {
    throw new InvalidRequestError('Access denied, invalid signed-fetch request, no sceneId')
  }

  // Check if user is banned from the scene
  if (!livekit.isLocalPreview(realmName)) {
    try {
      const isBanned = await sceneBans.isUserBanned(identity, {
        sceneId,
        realmName,
        parcel,
        isWorld
      })

      if (isBanned) {
        logger.warn(`Rejected connection from banned user: ${identity}`, {
          sceneId: sceneId || '',
          realmName,
          parcel,
          isWorld: String(isWorld)
        })
        throw new ForbiddenError('User is banned from this scene')
      }
    } catch (error) {
      if (error instanceof ForbiddenError) {
        throw error
      }

      // Ignore other errors
      logger.warn(`Error checking if user ${identity} is banned from scene: ${error}`, {
        sceneId: sceneId || '',
        realmName,
        parcel,
        isWorld: String(isWorld)
      })
    }
  }

  if (livekit.isLocalPreview(realmName)) {
    room = `preview-${identity}`

    forPreview = true
  } else if (isWorld) {
    const hasAccess = await worlds.hasWorldAccessPermission(identity, realmName)

    if (!hasAccess) {
      throw new UnauthorizedError('Access denied, you are not authorized to access this world')
    }

    // The client may send the world name as the sceneId instead of the actual content hash.
    // When that happens, the room name won't match the one used by ban/stream/cast operations
    // (which use the real content hash). Fetch the real sceneId from the world's about endpoint
    // to ensure all operations target the same LiveKit room.
    let worldSceneId = sceneId!
    if (sceneId!.endsWith('.eth')) {
      try {
        worldSceneId = await worlds.fetchWorldSceneId(realmName)
      } catch (error) {
        logger.error(`Failed to fetch scene ID for world ${realmName}: ${error}`)
        throw new InvalidRequestError(`Failed to resolve scene ID for world ${realmName}`)
      }
    }
    room = livekit.getWorldSceneRoomName(realmName, worldSceneId)
  } else {
    room = livekit.getSceneRoomName(realmName, sceneId!)
  }

  if (!permissions) {
    throw new NotFoundError('Realm or scene not found')
  }

  const credentials = await livekit.generateCredentials(identity, room, permissions, forPreview)
  logger.debug(`Token generated for ${identity} to join room ${room}`)

  return {
    status: 200,
    body: {
      adapter: livekit.buildConnectionUrl(credentials.url, credentials.token)
    }
  }
}
