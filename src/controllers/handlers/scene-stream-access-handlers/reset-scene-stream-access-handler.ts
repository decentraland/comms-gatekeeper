import { randomUUID } from 'crypto'
import { FOUR_DAYS } from '../../../logic/time'
import { validate } from '../../../logic/utils'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { PlaceAttributes } from '../../../types/places.type'
import { NotificationStreamingType } from '../../../types/notification.type'

export async function resetSceneStreamAccessHandler(
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
      '/scene-stream-access/reset'
    >,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneStreamAccessManager, sceneManager, places, livekit, notifications },
    verification
  } = ctx
  const logger = logs.getLogger('reset-scene-stream-access-handler')
  const { getPlaceByWorldName, getPlaceByParcel } = places
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

  const isOwnerOrAdmin = await isSceneOwnerOrAdmin(place, authenticatedAddress)
  if (!isOwnerOrAdmin) {
    logger.info(`Wallet ${authenticatedAddress} is not authorized to access this scene. Place ${place.id}`)
    throw new UnauthorizedError('Access denied, you are not authorized to access this scene')
  }

  const existingAccess = await sceneStreamAccessManager.getAccess(place.id)
  await livekit.removeIngress(existingAccess.ingress_id)
  await sceneStreamAccessManager.removeAccess(place.id)

  let roomName: string
  if (isWorlds) {
    roomName = livekit.getWorldRoomName(serverName)
  } else {
    roomName = livekit.getSceneRoomName(serverName, sceneId!)
  }

  const participantIdentity = randomUUID()
  const ingress = await livekit.getOrCreateIngress(roomName, `${participantIdentity}-streamer`)
  const access = await sceneStreamAccessManager.addAccess({
    place_id: place.id,
    streaming_url: ingress.url!,
    streaming_key: ingress.streamKey!,
    ingress_id: ingress.ingressId!
  })

  await notifications.sendNotificationType(NotificationStreamingType.STREAMING_KEY_RESET, place)

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
