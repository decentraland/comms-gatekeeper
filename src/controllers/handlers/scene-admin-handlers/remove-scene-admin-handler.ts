import { HandlerContextWithPath, InvalidRequestError } from '../../../types'
import { getPlace, hasLandPermission, hasWorldPermission, isPlaceAdmin, isValidAddress, validate } from '../utils'

export async function removeSceneAdminHandler(
  ctx: Pick<
    HandlerContextWithPath<'sceneAdminManager' | 'logs' | 'config' | 'fetch', '/scene-admin'>,
    'components' | 'url' | 'params' | 'verification' | 'request'
  >
) {
  const {
    components: { logs, sceneAdminManager, config },
    request,
    verification
  } = ctx

  const logger = logs.getLogger('remove-scene-admin-handler')

  const [placesApiUrl, lambdasUrl] = await Promise.all([
    config.requireString('PLACES_API_URL'),
    config.requireString('LAMBDAS_URL')
  ])

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const payload = await request.json()

  if (!payload.admin) {
    logger.warn(`Invalid scene admin payload`, payload)
    throw new InvalidRequestError(`Invalid payload`)
  }

  const { parcel, hostname, realmName } = await validate(ctx)
  const isWorlds = hostname.includes('worlds-content-server')
  const authAddress = verification.auth.toLowerCase()

  if (!isValidAddress(payload.admin)) {
    throw new InvalidRequestError('Invalid admin address')
  }

  const place = await getPlace(placesApiUrl, isWorlds, realmName, parcel)
  if (!place) {
    throw new InvalidRequestError('Place not found')
  }

  const hasPermission =
    (await hasLandPermission(lambdasUrl, authAddress, place.positions)) ||
    (await isPlaceAdmin(sceneAdminManager, place.id, authAddress))

  if (!hasPermission) {
    logger.warn(`User ${authAddress} is not authorized to remove admins for entity ${place.id}`)
    throw new InvalidRequestError('Only scene admins or the owner can remove admins')
  }

  const isAdminOwner = isWorlds
    ? await hasWorldPermission(lambdasUrl, payload.admin, place.world_name!)
    : await hasLandPermission(lambdasUrl, payload.admin, place.positions)

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
