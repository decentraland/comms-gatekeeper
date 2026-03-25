import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath, Permissions } from '../../types'
import { ForbiddenError, InvalidRequestError, NotFoundError, UnauthorizedError } from '../../types/errors'
import { oldValidate } from '../../logic/utils'

export async function commsSceneHandler(
  context: HandlerContextWithPath<
    | 'fetch'
    | 'config'
    | 'livekit'
    | 'logs'
    | 'denyList'
    | 'sceneBans'
    | 'places'
    | 'worlds'
    | 'userModeration'
    | 'sceneManager'
    | 'sceneStreamAccessManager',
    '/get-scene-adapter'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: {
      config,
      livekit,
      logs,
      denyList,
      sceneBans,
      worlds,
      userModeration,
      sceneManager,
      places,
      sceneStreamAccessManager
    }
  } = context

  const logger = logs.getLogger('comms-scene-handler')
  const { sceneId, identity, parcel, realmName } = await oldValidate(context)

  const allowLocalPreview = (await config.getString('ALLOW_LOCAL_PREVIEW')) === 'true'
  const isLocalPreview = allowLocalPreview && livekit.isLocalPreview(realmName)

  let forPreview = false
  let room: string
  const permissions: Permissions = {
    cast: [],
    mute: []
  }

  try {
    const { isBanned: isPlatformBanned } = await userModeration.isPlayerBanned(identity)
    if (isPlatformBanned) {
      logger.warn(`Rejected connection from platform-banned user: ${identity}`)
      throw new ForbiddenError('Access denied, platform-banned user')
    }
  } catch (error) {
    if (error instanceof ForbiddenError) {
      throw error
    }
    logger.warn(`Error checking platform ban status for ${identity}: ${error}`)
  }

  const isDenylisted = await denyList.isDenylisted(identity)
  if (isDenylisted) {
    logger.warn(`Rejected connection from deny-listed wallet: ${identity}`)
    throw new UnauthorizedError('Access denied, deny-listed wallet')
  }

  const isWorld = realmName.endsWith('.eth')

  if (!isLocalPreview && !sceneId) {
    throw new InvalidRequestError('Access denied, invalid signed-fetch request, no sceneId')
  }

  // The client may send the world name as the sceneId instead of the actual content hash.
  // Resolve the real sceneId once so both the ban check and room name use the same value.
  let resolvedSceneId = sceneId
  if (isWorld && sceneId?.endsWith('.eth')) {
    try {
      resolvedSceneId = await worlds.fetchWorldSceneId(realmName)
    } catch (error) {
      logger.error(`Failed to fetch scene ID for world ${realmName}: ${error}`)
      throw new InvalidRequestError(`Failed to resolve scene ID for world ${realmName}`)
    }
  }

  // Check if user is banned from the scene (skip for local preview)
  if (!isLocalPreview) {
    try {
      const isBanned = await sceneBans.isUserBanned(identity, {
        sceneId: resolvedSceneId,
        realmName,
        parcel,
        isWorld
      })

      if (isBanned) {
        logger.warn(`Rejected connection from banned user: ${identity}`, {
          sceneId: resolvedSceneId || '',
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
        sceneId: resolvedSceneId || '',
        realmName,
        parcel,
        isWorld: String(isWorld)
      })
    }
  }

  if (isLocalPreview) {
    if (resolvedSceneId) {
      room = livekit.getSceneRoomName(realmName, resolvedSceneId)
      forPreview = false
    } else {
      room = `preview-${identity}`
      forPreview = true
    }
  } else if (isWorld) {
    const hasAccess = await worlds.hasWorldAccessPermission(identity, realmName)

    if (!hasAccess) {
      throw new UnauthorizedError('Access denied, you are not authorized to access this world')
    }

    room = livekit.getWorldSceneRoomName(realmName, resolvedSceneId)
  } else {
    room = livekit.getSceneRoomName(realmName, sceneId)
  }

  if (!permissions) {
    throw new NotFoundError('Realm or scene not found')
  }

  // Check if user is a scene admin — admins get 'presenter' role
  // which allows them to control presentations via data channel
  let metadata: Record<string, unknown> | undefined
  try {
    if (isLocalPreview) {
      // Local preview — all users are admins for testing
      metadata = { role: 'presenter' }
      logger.info(`Local preview: ${identity} granted presenter role`)
    } else {
      const hasActivePresentation = await sceneStreamAccessManager.getAccessByRoomId(room)
      if (hasActivePresentation) {
        const place = isWorld ? await places.getWorldByName(realmName) : await places.getPlaceByParcel(parcel)
        const isAdmin = await sceneManager.isSceneOwnerOrAdmin(place, identity)
        if (isAdmin) {
          metadata = { role: 'presenter' }
          logger.info(`Admin ${identity} granted presenter role for room ${room}`)
        }
      }
    }
  } catch (err) {
    // Non-critical — if admin check fails, user just won't have presenter role
    logger.warn(`Failed to check admin status for ${identity}: ${err}`)
  }

  let credentials
  try {
    credentials = await livekit.generateCredentials(identity, room, permissions, forPreview, metadata)
  } catch (err) {
    logger.error(`Failed to generate credentials for ${identity} in room ${room}: ${err}`)
    throw err
  }
  logger.debug(`Token generated for ${identity} to join room ${room}`)

  return {
    status: 200,
    body: {
      adapter: livekit.buildConnectionUrl(credentials.url, credentials.token)
    }
  }
}
