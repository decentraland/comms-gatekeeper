import { PlaceAttributes } from '../../types/places.type'
import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath, Permissions } from '../../types'
import {
  ForbiddenError,
  InvalidRequestError,
  PlaceNotFoundError,
  ServiceUnavailableError,
  UnauthorizedError
} from '../../types/errors'
import { getRequestIp, oldValidate } from '../../logic/utils'

export async function commsSceneHandler(
  context: HandlerContextWithPath<
    | 'fetch'
    | 'config'
    | 'cast'
    | 'livekit'
    | 'logs'
    | 'accessGate'
    | 'sceneBans'
    | 'places'
    | 'worlds'
    | 'playerConnectionDb'
    | 'sceneManager'
    | 'sceneStreamAccessManager',
    '/get-scene-adapter'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { cast, livekit, logs, accessGate, sceneBans, worlds, playerConnectionDb, sceneManager, places }
  } = context

  const logger = logs.getLogger('comms-scene-handler')
  const { sceneId, identity, parcel, realmName, deviceIdentifier } = await oldValidate(context)

  const ipAddress = getRequestIp(context.request.headers)

  // These checks only depend on the resolved identity, so run them concurrently to save a DB
  // round-trip on the hot path. The connection-info upsert is best-effort (never blocks token
  // issuance); the ban lookup fails open while the deny list still propagates. Gate precedence
  // (platform ban → deny list) is preserved below.
  // Named for the platform gate specifically: a scene-scoped `isBanned` is declared further
  // down, and two different ban concepts sharing one name in this function is how the scene
  // check quietly stops being enforced the day someone moves that declaration.
  const [, { isBanned: isPlatformBanned, isDenylisted }] = await Promise.all([
    playerConnectionDb
      .upsertPlayerConnection({ address: identity, ipAddress, deviceId: deviceIdentifier })
      .catch((error) => {
        logger.warn(`Failed to store player connection info for ${identity}: ${error}`)
      }),
    accessGate.getAccessState({ address: identity, deviceId: deviceIdentifier }, { failOpenOnBanLookupError: true })
  ])

  if (isPlatformBanned) {
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

  const isWorld = realmName.toLowerCase().endsWith('.eth')

  if (!sceneId) {
    throw new InvalidRequestError('Access denied, invalid signed-fetch request, no sceneId')
  }

  let resolvedSceneId = sceneId

  let verifiedPlace: PlaceAttributes | undefined

  // Check if user is banned from the scene (skip for local preview)
  if (!isLocalPreview) {
    try {
      // Old world deployments reconnect to the current room at the same footprint. Enforce
      // today's place bans, and reuse this verified place for the presenter check below.
      const resolved = await places.resolveScenePlace(
        sceneId,
        isWorld ? realmName : undefined,
        isWorld ? parcel : undefined,
        {
          allowPreviousDeployment: true,
          allowMissingPlace: !isWorld
        }
      )
      resolvedSceneId = resolved.sceneId
      verifiedPlace = resolved.place
      const isBanned =
        verifiedPlace &&
        (await sceneBans.isUserBanned(identity, {
          verifiedPlaceId: verifiedPlace.id,
          sceneId: resolvedSceneId,
          realmName,
          isWorld
        }))

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
      if (
        error instanceof ForbiddenError ||
        error instanceof InvalidRequestError ||
        error instanceof PlaceNotFoundError
      ) {
        throw error
      }

      // Never issue a token when scene-ban enforcement could not complete.
      logger.warn(`Error checking if user ${identity} is banned from scene: ${error}`, {
        sceneId: resolvedSceneId || '',
        realmName,
        parcel,
        isWorld: String(isWorld)
      })
      throw new ServiceUnavailableError('Scene-ban verification is temporarily unavailable')
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
    // Use resolvedSceneId uniformly (equal to sceneId for non-world scenes) so all three
    // branches key the room off the same identifier.
    room = livekit.getSceneRoomName(realmName, resolvedSceneId)
  }

  // Add scene admins as presenters in room metadata
  try {
    if (isLocalPreview) {
      await cast.addPresenter(room, identity)
    } else {
      // Reuse the same verified place used for the ban check, including old-world joins
      // whose deployment footprint has been checked against the current world scene.
      const place = verifiedPlace
      const isAdmin = place && (await sceneManager.isSceneOwnerOrAdmin(place, identity))
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
