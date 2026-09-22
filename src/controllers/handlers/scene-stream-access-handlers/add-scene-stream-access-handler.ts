import { randomUUID } from 'crypto'
import { validate } from '../../../logic/utils'
import { HandlerContextWithPath } from '../../../types'
import { ForbiddenError, InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { SceneStreamAccess } from '../../../types'
import { PlaceAttributes } from '../../../types/places.type'
import { FOUR_DAYS } from '../../../logic/time'
import { getErrorMessage } from '../../../logic/errors'
import { removeReplacedIngress } from '../../../logic/stream-access'

export async function addSceneStreamAccessHandler(
  ctx: Pick<
    HandlerContextWithPath<
      | 'fetch'
      | 'sceneStreamAccessManager'
      | 'sceneManager'
      | 'places'
      | 'livekit'
      | 'logs'
      | 'config'
      | 'userModeration'
      | 'worlds',
      '/scene-stream-access'
    >,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneStreamAccessManager, sceneManager, places, livekit, userModeration, worlds },
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
    logger.warn(`Rejected stream key request from platform-banned user: ${authenticatedAddress}`)
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

  // Clients may send the world name as the sceneId; resolve it as generate-stream-link does so the
  // room check below compares against the room the scene actually uses.
  let resolvedSceneId = sceneId
  if (isWorld && sceneId.endsWith('.eth')) {
    try {
      resolvedSceneId = await worlds.fetchWorldSceneId(serverName)
    } catch (error) {
      logger.error(`Failed to resolve scene ID for world ${serverName}`, { error: getErrorMessage(error) })
      throw new InvalidRequestError(`Failed to resolve scene ID for world ${serverName}`)
    }
  }

  let roomName: string
  if (isWorld) {
    roomName = livekit.getWorldSceneRoomName(serverName, resolvedSceneId)
  } else {
    roomName = livekit.getSceneRoomName(serverName, resolvedSceneId)
  }

  // Reuse the active key only while it streams into this room; one minted for another room (a
  // redeploy, or before world room names were lower-cased) feeds a room nobody is in.
  const existingAccess = await sceneStreamAccessManager.getLatestAccessByPlaceId(place.id)

  let access: SceneStreamAccess
  if (existingAccess && existingAccess.room_id === roomName) {
    access = existingAccess
    logger.info(`Reusing existing OBS stream key for place ${place.id}`, {
      placeId: place.id,
      streamingKey: access.streaming_key.substring(0, 8) + '...',
      ingressId: access.ingress_id
    })
  } else {
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

    if (existingAccess) {
      await removeReplacedIngress(livekit, logger, existingAccess, ingress.ingressId)
    }

    logger.info(`Created new OBS stream key for place ${place.id}`, {
      placeId: place.id,
      streamingKey: access.streaming_key.substring(0, 8) + '...',
      ingressId: access.ingress_id,
      expiresAt: new Date(expirationTime).toISOString()
    })
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
