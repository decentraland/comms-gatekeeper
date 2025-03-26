import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { validate, validateFilters } from '../../../logic/utils'
import { PlaceAttributes } from '../../../types/places.type'
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
  const { getPlaceByWorldName, getPlaceByParcel } = places
  const { getUserScenePermissions, isSceneOwnerOrAdmin } = sceneManager

  if (!verification || verification?.auth === undefined) {
    logger.warn('Request without authentication')
    throw new UnauthorizedError('Authentication required')
  }

  const authenticatedAddress = verification.auth.toLowerCase()

  const {
    parcel,
    realm: { hostname, serverName }
  } = await validate(ctx)
  const isWorlds = hostname.includes('worlds-content-server')

  let place: PlaceAttributes
  if (isWorlds) {
    place = await getPlaceByWorldName(serverName)
  } else {
    place = await getPlaceByParcel(parcel)
  }

  const authenticatedUserScenePermissions = await getUserScenePermissions(place, authenticatedAddress)
  const isOwnerOrAdmin = await isSceneOwnerOrAdmin(authenticatedUserScenePermissions)
  if (!isOwnerOrAdmin) {
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
