import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath, Permissions } from '../../types'
import { ForbiddenError, InvalidRequestError, UnauthorizedError } from '../../types/errors'
import { getRequestIp, oldValidate } from '../../logic/utils'

export async function commsSceneHandler(
  context: HandlerContextWithPath<
    | 'fetch'
    | 'config'
    | 'cast'
    | 'livekit'
    | 'logs'
    | 'denyList'
    | 'sceneBans'
    | 'places'
    | 'worlds'
    | 'userModeration'
    | 'playerConnectionDb'
    | 'sceneManager'
    | 'sceneStreamAccessManager',
    '/get-scene-adapter'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: {
      cast,
      livekit,
      logs,
      denyList,
      sceneBans,
      worlds,
      userModeration,
      playerConnectionDb,
      sceneManager,
      places
    }
  } = context

  const logger = logs.getLogger('comms-scene-handler')
  const { sceneId, identity, parcel, realmName, deviceIdentifier } = await oldValidate(context)

  const ipAddress = getRequestIp(context.request.headers)

  // These checks only depend on the resolved identity, so run them concurrently to save a DB
  // round-trip on the hot path. Each is isolated to keep its current behavior: the
  // connection-info upsert is best-effort (never blocks token issuance) and the platform-ban
  // check fails open on error. Gate precedence (platform ban → deny list) is preserved below.
  const [, banStatus, isDenylisted] = await Promise.all([
    playerConnectionDb
      .upsertPlayerConnection({ address: identity, ipAddress, deviceId: deviceIdentifier })
      .catch((error) => {
        logger.warn(`Failed to store player connection info for ${identity}: ${error}`)
      }),
    userModeration.getActiveBanForConnection({ address: identity, deviceId: deviceIdentifier }).catch((error) => {
      logger.warn(`Error checking platform ban status for ${identity}: ${error}`)
      return { isBanned: false }
    }),
    denyList.isDenylisted(identity)
  ])

  if (banStatus.isBanned) {
    logger.warn(`Rejected connection from platform-banned user: ${identity}`)
    throw new ForbiddenError('Access denied, platform-banned user')
  }

  if (isDenylisted) {
    logger.warn(`Rejected connection from deny-listed wallet: ${identity}`)
    throw new UnauthorizedError('Access denied, deny-listed wallet')
  }

  const isLocalPreview = livekit.isLocalPreview(realmName)

  const forPreview = false
  let room: string
  const permissions: Permissions = {
    cast: [],
    mute: []
  }

  const isWorld = realmName.endsWith('.eth')

  if (!sceneId) {
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
    room = livekit.getSceneRoomName(realmName, resolvedSceneId)
  } else if (isWorld) {
    const hasAccess = await worlds.hasWorldAccessPermission(identity, realmName)

    if (!hasAccess) {
      throw new UnauthorizedError('Access denied, you are not authorized to access this world')
    }

    room = livekit.getWorldSceneRoomName(realmName, resolvedSceneId)
  } else {
    room = livekit.getSceneRoomName(realmName, sceneId)
  }

  // Add scene admins as presenters in room metadata
  try {
    if (isLocalPreview) {
      await cast.addPresenter(room, identity)
    } else {
      const place = isWorld ? await places.getWorldByName(realmName) : await places.getPlaceByParcel(parcel)
      const isAdmin = await sceneManager.isSceneOwnerOrAdmin(place, identity)
      if (isAdmin) {
        await cast.addPresenter(room, identity)
      }
    }
  } catch (err) {
    // Non-critical — if presenter update fails, user can still join
    logger.warn(`Failed to add presenter for ${identity}: ${err}`)
  }

  let credentials
  try {
    logger.info(
      `Generating credentials identity: ${identity} -- room: ${room} -- forPreview: ${JSON.stringify(forPreview)}`
    )
    credentials = await livekit.generateCredentials(identity, room, permissions, forPreview)
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
