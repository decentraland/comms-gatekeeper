import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'
import { PlaceAttributes } from '../../../types/places.type'
const FOUR_DAYS = 4 * 24 * 60 * 60

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
  const { getPlaceByWorldName, getPlaceByParcel } = places
  const { getUserScenePermissions, isSceneOwnerOrAdmin } = sceneManager
  if (!verification?.auth) {
    logger.error('Authentication required')
    throw new InvalidRequestError('Authentication required')
  }
  const authenticatedAddress = verification.auth

  const {
    parcel,
    realm: { hostname, serverName },
    sceneId
  } = await validate(ctx)
  const isWorlds = !!hostname?.includes('worlds-content-server')

  if (!isWorlds && !sceneId) {
    throw new InvalidRequestError('Access denied, invalid signed-fetch request, no sceneId')
  }

  let place: PlaceAttributes
  if (isWorlds) {
    place = await getPlaceByWorldName(serverName)
  } else {
    place = await getPlaceByParcel(parcel)
  }

  const authenticatedUserScenePermissions = await getUserScenePermissions(place, authenticatedAddress)

  const isOwnerOrAdmin = await isSceneOwnerOrAdmin(authenticatedUserScenePermissions)
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
