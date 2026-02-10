import { randomUUID } from 'crypto'
import { validate } from '../../../logic/utils'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, StreamingAccessNotFoundError, UnauthorizedError } from '../../../types/errors'
import { SceneStreamAccess } from '../../../types'
import { PlaceAttributes } from '../../../types/places.type'
import { FOUR_DAYS } from '../../../logic/time'

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
  const logger = logs.getLogger('add-scene-stream-access-handler')
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
    sceneId
  } = await validate(ctx)
  const isWorld = !!hostname?.includes('worlds-content-server')

  // sceneId is required for all requests
  if (!sceneId) {
    throw new InvalidRequestError('Access denied, invalid signed-fetch request, no sceneId')
  }

  let place: PlaceAttributes
  if (isWorld) {
    // For worlds: query /places with position and world name
    place = await getWorldScenePlace(serverName, parcel)
  } else {
    place = await getPlaceByParcel(parcel)
  }

  const isOwnerOrAdmin = await isSceneOwnerOrAdmin(place, authenticatedAddress)
  if (!isOwnerOrAdmin) {
    logger.info(`Wallet ${authenticatedAddress} is not authorized to access this scene. Place ${place.id}`)
    throw new UnauthorizedError('Access denied, you are not authorized to access this scene')
  }

  let roomName: string
  if (isWorld) {
    roomName = livekit.getWorldSceneRoomName(serverName, sceneId)
  } else {
    roomName = livekit.getSceneRoomName(serverName, sceneId)
  }

  let access: SceneStreamAccess
  try {
    access = await sceneStreamAccessManager.getAccess(place.id)
    logger.info(`Reusing existing OBS stream key for place ${place.id}`, {
      placeId: place.id,
      streamingKey: access.streaming_key.substring(0, 8) + '...',
      ingressId: access.ingress_id
    })
  } catch (error) {
    if (error instanceof StreamingAccessNotFoundError) {
      const participantIdentity = randomUUID()
      const ingress = await livekit.getOrCreateIngress(roomName, `${participantIdentity}-streamer`)
      const expirationTime = Date.now() + FOUR_DAYS

      access = await sceneStreamAccessManager.addAccess({
        place_id: place.id,
        streaming_url: ingress.url!,
        streaming_key: ingress.streamKey!,
        ingress_id: ingress.ingressId!,
        room_id: roomName,
        expiration_time: expirationTime,
        generated_by: authenticatedAddress
      })

      logger.info(`Created new OBS stream key for place ${place.id}`, {
        placeId: place.id,
        streamingKey: access.streaming_key.substring(0, 8) + '...',
        ingressId: access.ingress_id,
        expiresAt: new Date(expirationTime).toISOString()
      })
    } else {
      logger.debug('Error getting stream access: ', { error: JSON.stringify(error) })
      throw error
    }
  }

  return {
    status: 200,
    body: {
      streaming_url: access.streaming_url,
      streaming_key: access.streaming_key,
      created_at: Number(access.created_at),
      ends_at: access.expiration_time ? Number(access.expiration_time) : Number(access.created_at) + FOUR_DAYS
    }
  }
}
