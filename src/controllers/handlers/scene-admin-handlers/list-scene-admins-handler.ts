import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath, InvalidRequestError, UnauthorizedError } from '../../../types'
import { validate, validateFilters } from '../../../logic/utils'

export async function listSceneAdminsHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'sceneAdminManager' | 'logs' | 'config' | 'fetch' | 'sceneManager' | 'places',
      '/scene-admin'
    >,
    'components' | 'url' | 'verification' | 'request' | 'params'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, sceneAdminManager, sceneManager, places },
    url,
    verification
  } = ctx

  const logger = logs.getLogger('list-scene-admins-handler')
  const { getPlace } = places
  const { hasPermissionPrivilege } = sceneManager

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

  const canList = await hasPermissionPrivilege(place, authenticatedAddress)
  if (!canList) {
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
