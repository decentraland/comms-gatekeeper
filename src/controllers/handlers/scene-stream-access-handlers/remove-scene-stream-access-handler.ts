import { validate } from '../../../logic/utils'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { NotificationStreamingType } from '../../../types/notification.type'
import { PlaceAttributes } from '../../../types/places.type'

export async function removeSceneStreamAccessHandler(
  ctx: Pick<
    HandlerContextWithPath<
      | 'fetch'
      | 'sceneStreamAccessManager'
      | 'sceneManager'
      | 'places'
      | 'livekit'
      | 'logs'
      | 'config'
      | 'notifications',
      '/scene-stream-access'
    >,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneStreamAccessManager, sceneManager, places, livekit, notifications },
    verification
  } = ctx
  const logger = logs.getLogger('revoke-scene-stream-access-handler')
  const { getWorldScenePlace, getWorldByName, getPlaceByParcel } = places
  const { isSceneOwnerOrAdmin } = sceneManager
  if (!verification?.auth) {
    logger.debug('Authentication required')
    throw new InvalidRequestError('Authentication required')
  }
  const authenticatedAddress = verification.auth

  const {
    parcel,
    realm: { hostname, serverName },
    sceneId
  } = await validate(ctx)
  const isWorld = !!hostname?.includes('worlds-content-server')

  // sceneId is required for all requests
  if (!sceneId) {
    throw new InvalidRequestError('Access denied, invalid signed-fetch request, no sceneId')
  }

  // For worlds: use the world scene place for streaming key operations (scene-specific),
  // but the world place for permission checks (world-wide admin/owner).
  let place: PlaceAttributes
  let permissionPlace: PlaceAttributes
  if (isWorld) {
    place = await getWorldScenePlace(serverName, parcel)
    permissionPlace = await getWorldByName(serverName)
  } else {
    place = await getPlaceByParcel(parcel)
    permissionPlace = place
  }

  const isOwnerOrAdmin = await isSceneOwnerOrAdmin(permissionPlace, authenticatedAddress)
  if (!isOwnerOrAdmin) {
    logger.info(`Wallet ${authenticatedAddress} is not authorized to access this scene. Place ${place.id}`)
    throw new UnauthorizedError('Access denied, you are not authorized to access this scene')
  }

  const access = await sceneStreamAccessManager.getAccess(place.id)
  await livekit.removeIngress(access.ingress_id)
  await sceneStreamAccessManager.removeAccess(place.id)

  await notifications.sendNotificationType(NotificationStreamingType.STREAMING_KEY_REVOKE, place)

  return {
    status: 204
  }
}
