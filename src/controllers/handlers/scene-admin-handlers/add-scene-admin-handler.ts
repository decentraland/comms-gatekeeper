import { InvalidRequestError } from '../../../types'
import { HandlerContextWithPath } from '../../../types'
import { validate, getPlace, hasLandPermission, hasWorldPermission, isPlaceAdmin, isValidAddress } from '../utils'

export async function addSceneAdminHandler(
  ctx: Pick<
    HandlerContextWithPath<'fetch' | 'sceneAdminManager' | 'logs' | 'config', '/scene-admin'>,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneAdminManager, config },
    request,
    verification
  } = ctx

  const logger = logs.getLogger('add-scene-admin-handler')
  const [placesApiUrl, lambdasUrl] = await Promise.all([
    config.requireString('PLACES_API_URL'),
    config.requireString('LAMBDAS_URL')
  ])

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const payload = await request.json()
  if (!payload.admin || !isValidAddress(payload.admin)) {
    logger.warn(`Invalid scene admin payload`, payload)
    throw new InvalidRequestError(`Invalid payload`)
  }

  const { parcel, hostname, realmName } = await validate(ctx)
  const isWorlds = hostname!.includes('worlds-content-server')
  const authAddress = verification.auth

  try {
    const place = await getPlace(placesApiUrl, isWorlds, realmName, parcel)

    const isOwner = isWorlds
      ? await hasWorldPermission(lambdasUrl, authAddress, place.world_name!)
      : await hasLandPermission(lambdasUrl, authAddress, place.positions)

    const isAdmin = await isPlaceAdmin(sceneAdminManager, place.id, authAddress)

    if (!isOwner && !isAdmin) {
      throw new InvalidRequestError('You do not have permission to add admins to this place')
    }

    if (place.owner && place.owner.toLowerCase() === payload.admin.toLowerCase()) {
      throw new InvalidRequestError('Cannot add the owner as an admin')
    }

    const isAlreadyAdmin = await isPlaceAdmin(sceneAdminManager, place.id, payload.admin)
    if (isAlreadyAdmin) {
      throw new InvalidRequestError('This address is already an admin')
    }

    await sceneAdminManager.addAdmin({
      place_id: place.id,
      admin: payload.admin.toLowerCase(),
      added_by: authAddress.toLowerCase()
    })

    return {
      status: 204
    }
  } catch (error) {
    logger.error(`Error adding scene admin: ${error}`)
    throw new InvalidRequestError(`Failed to add scene admin: ${error}`)
  }
}
