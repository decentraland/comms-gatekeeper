import { InvalidRequestError, UnauthorizedError } from '../../../types'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'

const FOUR_DAYS = 4 * 24 * 60 * 60

export async function listSceneStreamAccessHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'fetch' | 'sceneAdminManager' | 'sceneStreamAccessManager' | 'sceneFetcher' | 'logs' | 'config',
      '/scene-stream-access'
    >,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneAdminManager, sceneStreamAccessManager, sceneFetcher },
    verification
  } = ctx
  const logger = logs.getLogger('get-scene-stream-access-handler')
  if (!verification?.auth) {
    logger.error('Authentication required')
    throw new InvalidRequestError('Authentication required')
  }
  const authenticatedAddress = verification.auth

  const { getPlace, hasWorldOwnerPermission, hasLandPermission } = sceneFetcher

  const { parcel, hostname, realmName, sceneId } = await validate(ctx)
  const isWorlds = !!hostname?.includes('worlds-content-server')

  if (!isWorlds && !sceneId) {
    throw new UnauthorizedError('Access denied, invalid signed-fetch request, no sceneId')
  }

  const place = await getPlace(isWorlds, realmName, parcel)

  const isOwner = isWorlds
    ? await hasWorldOwnerPermission(authenticatedAddress, place.world_name!)
    : await hasLandPermission(authenticatedAddress, place.positions)

  const isAdmin = await sceneAdminManager.isAdmin(place.id, authenticatedAddress)

  if (!isOwner && !isAdmin) {
    logger.info(`Wallet ${authenticatedAddress} is not owner nor admin of the scene. Place ${place.id}`)
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
