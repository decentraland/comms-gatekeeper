import { ForbiddenError, InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'
import { PlaceAttributes } from '../../../types/places.type'
import { FOUR_DAYS } from '../../../logic/time'

export async function listSceneStreamAccessHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'fetch' | 'sceneStreamAccessManager' | 'sceneManager' | 'places' | 'logs' | 'config' | 'userModeration',
      '/scene-stream-access'
    >,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneStreamAccessManager, sceneManager, places, userModeration },
    verification
  } = ctx
  const logger = logs.getLogger('get-scene-stream-access-handler')
  const { getWorldScenePlace, getPlaceByParcel } = places
  const { isSceneOwnerOrAdmin } = sceneManager
  if (!verification?.auth) {
    logger.debug('Authentication required')
    throw new InvalidRequestError('Authentication required')
  }
  const authenticatedAddress = verification.auth

  const {
    parcel,
    realm: { hostname, serverName },
    sceneId,
    deviceIdentifier
  } = await validate(ctx)
  const isWorld = !!hostname?.includes('worlds-content-server')

  // Before the admin check: this returns a streaming key, and validateStreamerToken honours a key
  // without re-checking the wallet.
  const { isBanned } = await userModeration.getActiveBanForConnection({
    address: authenticatedAddress.toLowerCase(),
    deviceId: deviceIdentifier
  })
  if (isBanned) {
    logger.warn(`Rejected stream key retrieval from platform-banned user: ${authenticatedAddress}`)
    throw new ForbiddenError('Access denied, platform-banned user')
  }

  // sceneId is required for all requests
  if (!sceneId) {
    throw new InvalidRequestError('Access denied, invalid signed-fetch request, no sceneId')
  }

  let place: PlaceAttributes
  if (isWorld) {
    place = await getWorldScenePlace(serverName, parcel)
  } else {
    place = await getPlaceByParcel(parcel)
  }

  const isOwnerOrAdmin = await isSceneOwnerOrAdmin(place, authenticatedAddress)
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
