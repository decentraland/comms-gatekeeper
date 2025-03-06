import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath, InvalidRequestError } from '../../../types'
import { getPlace, hasLandPermission, isPlaceAdmin, validate, validateFilters, hasWorldPermission } from '../utils'

export async function listSceneAdminsHandler(
  ctx: Pick<
    HandlerContextWithPath<'sceneAdminManager' | 'logs' | 'config' | 'fetch', '/scene-admin'>,
    'components' | 'url' | 'verification' | 'request' | 'params'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { sceneAdminManager, logs, config },
    url,
    verification
  } = ctx

  const logger = logs.getLogger('list-scene-admins-handler')

  if (!verification || verification?.auth === undefined) {
    logger.warn('Request without authentication')
    throw new InvalidRequestError('Authentication required')
  }
  const [placesApiUrl, lambdasUrl] = await Promise.all([
    config.requireString('PLACES_API_URL'),
    config.requireString('LAMBDAS_URL')
  ])

  const authAddress = verification.auth.toLowerCase()

  const { parcel, hostname, realmName } = await validate(ctx)
  const isWorlds = hostname.includes('worlds-content-server')

  const place = await getPlace(placesApiUrl, isWorlds, realmName, parcel)
  if (!place) {
    logger.warn(`Place not found for parcel: ${parcel}`)
    return {
      status: 404,
      body: { error: 'Place not found' }
    }
  }

  const hasPermission = isWorlds
    ? await hasWorldPermission(lambdasUrl, authAddress, place.world_name!)
    : (await hasLandPermission(lambdasUrl, authAddress, place.positions)) ||
      (await isPlaceAdmin(sceneAdminManager, place.id, authAddress))

  if (!hasPermission) {
    logger.warn(`Usuario ${authAddress} no está autorizado para listar administradores de la entidad ${place.id}`)
    throw new InvalidRequestError('Solo los administradores o el propietario pueden listar los administradores')
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

  try {
    const placesApiUrl = await config.requireString('PLACES_API_URL')
    const { parcel, hostname, realmName } = await validate(ctx)
    const isWorlds = hostname.includes('worlds-content-server')

    const place = await getPlace(placesApiUrl, isWorlds, realmName, parcel)
    if (!place) {
      logger.warn(`Place not found for parcel: ${parcel}`)
      return {
        status: 404,
        body: { error: 'Place not found' }
      }
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
  } catch (error) {
    logger.error(`Error listing scene admins: ${error}`)
    throw new InvalidRequestError('Failed to list scene admins')
  }
}
