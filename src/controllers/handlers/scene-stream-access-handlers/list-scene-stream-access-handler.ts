import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'
import { PlaceAttributes } from '../../../types/places.type'
import { FOUR_DAYS } from '../../../logic/time'

export async function listSceneStreamAccessHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'fetch' | 'sceneStreamAccessManager' | 'sceneManager' | 'places' | 'logs' | 'config',
      '/scene-stream-access'
    >,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneStreamAccessManager, sceneManager, places },
    verification
  } = ctx
  const logger = logs.getLogger('get-scene-stream-access-handler')
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

  return {
    status: 200,
    body: {
      streaming_url: access.streaming_url,
      streaming_key: access.streaming_key,
      created_at: Number(access.created_at),
      ends_at: Number(access.created_at) + FOUR_DAYS
    }
  }
}
