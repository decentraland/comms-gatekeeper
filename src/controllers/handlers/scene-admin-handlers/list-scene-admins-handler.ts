import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath, InvalidRequestError, UnauthorizedError } from '../../../types'
import { validate, validateFilters } from '../../../logic/utils'

export async function listSceneAdminsHandler(
  ctx: Pick<
    HandlerContextWithPath<'sceneAdminManager' | 'sceneFetcher' | 'logs' | 'config' | 'fetch', '/scene-admin'>,
    'components' | 'url' | 'verification' | 'request' | 'params'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { sceneFetcher, logs, sceneAdminManager },
    url,
    verification
  } = ctx

  const { getPlace, hasLandPermission, hasWorldOwnerPermission } = sceneFetcher

  const logger = logs.getLogger('list-scene-admins-handler')

  if (!verification || verification?.auth === undefined) {
    logger.warn('Request without authentication')
    throw new UnauthorizedError('Authentication required')
  }

  const authenticatedAddress = verification.auth.toLowerCase()

  const { parcel, hostname, realmName } = await validate(ctx)
  const isWorlds = hostname.includes('worlds-content-server')

  const place = await getPlace(isWorlds, realmName, parcel)
  if (!place) {
    logger.warn(`Place not found for parcel: ${parcel}`)
    return {
      status: 404,
      body: { error: 'Place not found' }
    }
  }

  const isOwner = isWorlds
    ? await hasWorldOwnerPermission(authenticatedAddress, place.world_name!)
    : await hasLandPermission(authenticatedAddress, place.positions)

  const isAdmin = await sceneAdminManager.isAdmin(place.id, authenticatedAddress)
  const hasWorldStreamingPermission =
    isWorlds && (await sceneFetcher.hasWorldStreamingPermission(authenticatedAddress, realmName))

  if (!isOwner && !isAdmin && !hasWorldStreamingPermission) {
    logger.warn(`User ${authenticatedAddress} is not authorized to list administrators of entity ${place.id}`)
    throw new UnauthorizedError('Only administrators or the owner can list administrators')
  }

  const searchParams = url.searchParams
  const adminFilter = searchParams.get('admin') || undefined

  const filters = {
    admin: adminFilter
  }

  const validationResult = validateFilters(filters)

  if (!validationResult.valid) {
    logger.warn(`Invalid filter parameters: ${validationResult.error}`)
    throw new InvalidRequestError(`Invalid parameters: ${validationResult.error}`)
  }

  const sceneAdminFilters = {
    place_id: place.id,
    admin: validationResult.value.admin
  }

  const admins = await sceneAdminManager.listActiveAdmins(sceneAdminFilters)

  return {
    status: 200,
    body: admins
  }
}
