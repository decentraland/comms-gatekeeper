import { EthAddress } from '@dcl/schemas'
import { HandlerContextWithPath, InvalidRequestError, UnauthorizedError } from '../../../types'
import { validate } from '../../../logic/utils'

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

  const { getPlace, hasLandPermission, hasWorldOwnerPermission } = sceneFetcher

  if (!verification?.auth) {
    throw new UnauthorizedError('Authentication required')
  }

  const payload = await request.json()

  const adminToRemove = payload.admin

  if (!adminToRemove) {
    logger.warn(`Invalid scene admin payload`, payload)
    throw new InvalidRequestError(`Invalid payload`)
  }

  const { parcel, hostname, realmName } = await validate(ctx)
  const isWorlds = hostname.includes('worlds-content-server')
  const authenticatedAddress = verification.auth.toLowerCase()

  if (!EthAddress.validate(adminToRemove)) {
    throw new UnauthorizedError('Invalid admin address')
  }

  const place = await getPlace(isWorlds, realmName, parcel)
  if (!place) {
    throw new InvalidRequestError('Place not found')
  }

  const isOwner = isWorlds
    ? await hasWorldOwnerPermission(authenticatedAddress, place.world_name!)
    : await hasLandPermission(authenticatedAddress, place.positions)

  const hasWorldStreamingPermission =
    isWorlds && (await sceneFetcher.hasWorldStreamingPermission(authenticatedAddress, realmName))

  const isAdmin = await sceneAdminManager.isAdmin(place.id, authenticatedAddress)

  if (!isOwner && !isAdmin && !hasWorldStreamingPermission) {
    logger.warn(`User ${authenticatedAddress} is not authorized to remove admins for entity ${place.id}`)
    throw new UnauthorizedError('Only scene admins or the owner can remove admins')
  }

  const isOwnerToRemove = isWorlds
    ? await hasWorldOwnerPermission(adminToRemove, place.world_name!)
    : await hasLandPermission(adminToRemove, place.positions)

  if (isOwnerToRemove) {
    logger.warn(`Attempt to remove owner ${adminToRemove} from entity ${place.id} by ${authenticatedAddress}`)
    throw new InvalidRequestError('Cannot remove the owner of the scene')
  }

  const isWorldStreamingPermissionToRemove =
    isWorlds && (await sceneFetcher.hasWorldStreamingPermission(adminToRemove, realmName))

  if (isWorldStreamingPermissionToRemove) {
    logger.warn(
      `Attempt to remove world streaming permission ${adminToRemove} from from World Contente Server. Wrong endpoint`
    )
    throw new InvalidRequestError('Cannot remove world streaming permission from World Content Server. Wrong endpoint')
  }

  const isTargetAdminActive = await sceneAdminManager.isAdmin(place.id, adminToRemove)
  if (!isTargetAdminActive) {
    throw new InvalidRequestError('The specified admin does not exist or is already inactive')
  }

  await sceneAdminManager.removeAdmin(place.id, adminToRemove)
  return {
    status: 204
  }
}
