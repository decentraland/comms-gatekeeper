import { EthAddress } from '@dcl/schemas'
import { HandlerContextWithPath, InvalidRequestError, UnauthorizedError } from '../../../types'
import { validate } from '../../../logic/utils'

export async function removeSceneAdminHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'sceneAdminManager' | 'logs' | 'config' | 'fetch' | 'sceneManager' | 'places' | 'world',
      '/scene-admin'
    >,
    'components' | 'url' | 'params' | 'verification' | 'request'
  >
) {
  const {
    components: { logs, sceneAdminManager, sceneManager, places, world },
    request,
    verification
  } = ctx

  const { getPlace } = places
  const { hasPermissionPrivilege, isSceneOwner } = sceneManager
  const { hasWorldStreamingPermission } = world
  const logger = logs.getLogger('remove-scene-admin-handler')

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

  const canRemove = await hasPermissionPrivilege(place, authenticatedAddress)
  if (!canRemove) {
    logger.warn(`User ${authenticatedAddress} is not authorized to remove admins for entity ${place.id}`)
    throw new UnauthorizedError('Only scene admins or the owner can remove admins')
  }

  const isOwnerToRemove = await isSceneOwner(place, adminToRemove)

  if (isOwnerToRemove) {
    logger.warn(`Attempt to remove owner ${adminToRemove} from entity ${place.id} by ${authenticatedAddress}`)
    throw new InvalidRequestError('Cannot remove the owner of the scene')
  }

  const isWorldStreamingPermissionToRemove =
    place.world && (await hasWorldStreamingPermission(adminToRemove, realmName))

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
