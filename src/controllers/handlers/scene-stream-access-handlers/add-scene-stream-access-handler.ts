import {
  InvalidRequestError,
  SceneStreamAccess,
  StreamingAccessUnavailableError,
  UnauthorizedError
} from '../../../types'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../utils'

export async function addSceneStreamAccessHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'fetch' | 'sceneAdminManager' | 'sceneStreamAccessManager' | 'sceneFetcher' | 'livekit' | 'logs' | 'config',
      '/scene-stream-access'
    >,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneAdminManager, sceneStreamAccessManager, sceneFetcher, livekit },
    verification
  } = ctx
  const logger = logs.getLogger('get-scene-stream-access-handler')
  if (!verification?.auth) {
    logger.error('Authentication required')
    throw new InvalidRequestError('Authentication required')
  }
  const authenticatedAddress = verification.auth

  const { getPlace, hasWorldPermission, hasLandPermission } = sceneFetcher

  const { parcel, hostname, realmName, sceneId } = await validate(ctx)
  const isWorlds = !!hostname?.includes('worlds-content-server')

  if (!isWorlds && !sceneId) {
    throw new UnauthorizedError('Access denied, invalid signed-fetch request, no sceneId')
  }

  const place = await getPlace(isWorlds, realmName, parcel)

  const isOwner = isWorlds
    ? await hasWorldPermission(authenticatedAddress, place.world_name!)
    : await hasLandPermission(authenticatedAddress, place.positions)

  const isAdmin = await sceneAdminManager.isAdmin(place.id, authenticatedAddress)

  if (!isOwner && !isAdmin) {
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
      const ingress = await livekit.getOrCreateIngress(roomName)
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
      created_at: access.created_at,
      ends_at: access.created_at + 4 * 24 * 60 * 60
    }
  }
}
