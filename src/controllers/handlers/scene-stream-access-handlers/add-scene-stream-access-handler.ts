import { validate } from '../../../logic/utils'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, StreamingAccessUnavailableError, UnauthorizedError } from '../../../types/errors'
import { SceneStreamAccess } from '../../../types'
import { PlaceAttributes } from '../../../types/places.type'
const FOUR_DAYS = 4 * 24 * 60 * 60

export async function addSceneStreamAccessHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'fetch' | 'sceneStreamAccessManager' | 'sceneManager' | 'places' | 'livekit' | 'logs' | 'config',
      '/scene-stream-access'
    >,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneStreamAccessManager, sceneManager, places, livekit },
    verification
  } = ctx
  const logger = logs.getLogger('get-scene-stream-access-handler')
  const { getPlaceByWorldName, getPlaceByParcel } = places
  const { hasPermissionPrivilege } = sceneManager
  if (!verification?.auth) {
    logger.error('Authentication required')
    throw new InvalidRequestError('Authentication required')
  }
  const authenticatedAddress = verification.auth

  const { parcel, hostname, realmName, sceneId } = await validate(ctx)
  const isWorlds = !!hostname?.includes('worlds-content-server')

  if (!isWorlds && !sceneId) {
    throw new InvalidRequestError('Access denied, invalid signed-fetch request, no sceneId')
  }

  let place: PlaceAttributes
  if (isWorlds) {
    place = await getPlaceByWorldName(realmName)
  } else {
    place = await getPlaceByParcel(parcel)
  }

  const canCreateStreamKey = await hasPermissionPrivilege(place, authenticatedAddress)

  if (!canCreateStreamKey) {
    logger.info(`Wallet ${authenticatedAddress} is not owner nor admin of the scene. Place ${place.id}`)
    throw new UnauthorizedError('Access denied, you are not authorized to access this scene')
  }

  let roomName: string
  if (isWorlds) {
    roomName = livekit.getWorldRoomName(realmName)
  } else {
    roomName = livekit.getSceneRoomName(realmName, sceneId!)
  }

  let access: SceneStreamAccess
  try {
    access = await sceneStreamAccessManager.getAccess(place.id)
  } catch (error) {
    if (error instanceof StreamingAccessUnavailableError) {
      const ingress = await livekit.getOrCreateIngress(roomName, authenticatedAddress)
      access = await sceneStreamAccessManager.addAccess({
        place_id: place.id,
        streaming_url: ingress.url!,
        streaming_key: ingress.streamKey!,
        ingress_id: ingress.ingressId!
      })
    } else {
      logger.error('Error getting stream access: ', { error: JSON.stringify(error) })
      throw error
    }
  }

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
