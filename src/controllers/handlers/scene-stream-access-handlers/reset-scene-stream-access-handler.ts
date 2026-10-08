import { randomUUID } from 'crypto'
import { FOUR_DAYS, getStreamAccessExpirationTime } from '../../../logic/time'
import { validate } from '../../../logic/utils'
import { HandlerContextWithPath } from '../../../types'
import {
  ForbiddenError,
  InvalidRequestError,
  LivekitIngressNotFoundError,
  PlaceNotFoundError,
  StreamingAccessNotFoundError,
  ServiceUnavailableError,
  UnauthorizedError
} from '../../../types/errors'
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
      | 'notifications'
      | 'userModeration',
      '/scene-stream-access/reset'
    >,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneStreamAccessManager, sceneManager, places, livekit, notifications, userModeration },
    verification
  } = ctx
  const logger = logs.getLogger('reset-scene-stream-access-handler')
  const { resolveScenePlace } = places
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
  const isPreview = livekit.isLocalPreview(serverName)
  const isWorld = !isPreview && !!hostname?.includes('worlds-content-server')

  // sceneId is required for all requests
  if (!sceneId) {
    throw new InvalidRequestError('Access denied, invalid signed-fetch request, no sceneId')
  }

  // Before the admin check: this mints a streaming key, and validateStreamerToken honours a key without
  // re-checking the wallet.
  const { isBanned } = await userModeration.getActiveBanForConnection({
    address: authenticatedAddress.toLowerCase(),
    deviceId: deviceIdentifier
  })
  if (isBanned) {
    logger.warn(`Rejected stream key reset from platform-banned user: ${authenticatedAddress}`)
    throw new ForbiddenError('Access denied, platform-banned user')
  }

  try {
    const { sceneId: resolvedSceneId, place } = isPreview
      ? { sceneId, place: undefined }
      : await resolveScenePlace(sceneId, isWorld ? serverName : undefined, parcel)
    const roomName = isWorld
      ? livekit.getWorldSceneRoomName(serverName, resolvedSceneId)
      : livekit.getSceneRoomName(serverName, resolvedSceneId)
    const placeId = place?.id ?? roomName

    const isOwnerOrAdmin =
      isPreview ||
      (place !== undefined && (await isSceneOwnerOrAdmin(place, authenticatedAddress, { skipCache: true })))
    if (!isOwnerOrAdmin) {
      logger.info(`Wallet ${authenticatedAddress} is not authorized to access this scene. Place ${placeId}`)
      throw new UnauthorizedError('Access denied, you are not authorized to access this scene')
    }

    const existingAccess = await sceneStreamAccessManager.getAccess(placeId)
    logger.info(`Removing ingress ${existingAccess.ingress_id}`)
    try {
      await livekit.removeIngress(existingAccess.ingress_id)
    } catch (error) {
      if (error instanceof LivekitIngressNotFoundError) {
        logger.error(`Ingress ${existingAccess.ingress_id} not found`)
      } else {
        logger.error(`Error removing ingress ${existingAccess.ingress_id}`, { error: JSON.stringify(error) })
        throw error
      }
    }
    logger.info(`Removed ingress ${existingAccess.ingress_id}`)
    logger.info(`Removing access ${placeId}`)
    await sceneStreamAccessManager.removeAccess(placeId)
    logger.info(`Removed access ${placeId}`)

    const participantIdentity = randomUUID()
    const ingress = await livekit.createIngress(roomName, `${participantIdentity}-streamer`)
    logger.info(`Created ingress ${ingress.ingressId}`)
    const expirationTime = Date.now() + FOUR_DAYS
    const access = await sceneStreamAccessManager.addAccess({
      place_id: placeId,
      streaming_url: ingress.url!,
      streaming_key: ingress.streamKey!,
      ingress_id: ingress.ingressId!,
      expiration_time: expirationTime,
      room_id: roomName,
      generated_by: authenticatedAddress.toLowerCase()
    })
    logger.info(`Created access ${access.id}`)
    if (place) await notifications.sendNotificationType(NotificationStreamingType.STREAMING_KEY_RESET, place)

    return {
      status: 200,
      body: {
        streaming_url: access.streaming_url,
        streaming_key: access.streaming_key,
        created_at: Number(access.created_at),
        ends_at: getStreamAccessExpirationTime(access)
      }
    }
  } catch (error) {
    logger.error('Error resetting scene stream access', { error: JSON.stringify(error) })
    if (error instanceof UnauthorizedError) {
      return {
        status: 401,
        body: {
          error: error.message
        }
      }
    }
    if (error instanceof ServiceUnavailableError)
      return { status: 503, headers: { 'Retry-After': '1' }, body: { error: error.message } }
    if (
      error instanceof InvalidRequestError ||
      error instanceof PlaceNotFoundError ||
      error instanceof StreamingAccessNotFoundError
    ) {
      return { status: error instanceof InvalidRequestError ? 400 : 404, body: { error: error.message } }
    }
    return {
      status: 500,
      body: {
        error: 'Failed to reset scene stream access'
      }
    }
  }
}
