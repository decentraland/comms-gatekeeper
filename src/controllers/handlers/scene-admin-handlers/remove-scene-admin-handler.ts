import { EthAddress } from '@dcl/schemas'
import { HandlerContextWithPath, InvalidRequestError, UnauthorizedError } from '../../../types'
import { validate } from '../utils'

export async function removeSceneAdminHandler(
  ctx: Pick<
    HandlerContextWithPath<'sceneAdminManager' | 'sceneFetcher' | 'logs' | 'config' | 'fetch', '/scene-admin'>,
    'components' | 'url' | 'params' | 'verification' | 'request'
  >
) {
  const {
    components: { logs, sceneFetcher, sceneAdminManager },
    request,
    verification
  } = ctx

  const logger = logs.getLogger('remove-scene-admin-handler')

  const { getPlace, hasLandPermission, hasWorldPermission } = sceneFetcher

  if (!verification?.auth) {
    throw new UnauthorizedError('Authentication required')
  }

  const payload = await request.json()

  if (!payload.admin) {
    logger.warn(`Invalid scene admin payload`, payload)
    throw new InvalidRequestError(`Invalid payload`)
  }

  const { parcel, hostname, realmName } = await validate(ctx)
  const isWorlds = hostname.includes('worlds-content-server')
  const authAddress = verification.auth.toLowerCase()

  if (!EthAddress.validate(payload.admin)) {
    throw new UnauthorizedError('Invalid admin address')
  }

  const place = await getPlace(isWorlds, realmName, parcel)
  if (!place) {
    throw new InvalidRequestError('Place not found')
  }

  const hasPermission =
    (isWorlds
      ? await hasWorldPermission(authAddress, place.world_name!)
      : await hasLandPermission(authAddress, place.positions)) ||
    (await sceneAdminManager.isAdmin(place.id, authAddress))

  if (!hasPermission) {
    logger.warn(`User ${authAddress} is not authorized to remove admins for entity ${place.id}`)
    throw new UnauthorizedError('Only scene admins or the owner can remove admins')
  }

  const isAdminOwner = isWorlds
    ? await hasWorldPermission(payload.admin, place.world_name!)
    : await hasLandPermission(payload.admin, place.positions)

  if (isAdminOwner) {
    logger.warn(`Attempt to remove owner ${payload.admin} from entity ${place.id} by ${authAddress}`)
    throw new InvalidRequestError('Cannot remove the owner of the scene')
  }

  const isTargetAdminActive = await sceneAdminManager.isAdmin(place.id, payload.admin)
  if (!isTargetAdminActive) {
    throw new InvalidRequestError('The specified admin does not exist or is already inactive')
  }

  try {
    await sceneAdminManager.removeAdmin(place.id, payload.admin)
    return {
      status: 204
    }
  } catch (error) {
    logger.error(`Error in scene admin operation: ${error}`)
    throw new InvalidRequestError('Failed to complete the operation')
  }
}
