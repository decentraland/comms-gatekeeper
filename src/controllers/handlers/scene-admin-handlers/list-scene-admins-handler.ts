import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { validate, validateFilters } from '../../../logic/utils'
import { PlaceAttributes } from '../../../types/places.type'
import { PermissionsOverWorld, PermissionType } from '../../../types/worlds.type'

export async function listSceneAdminsHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'sceneAdminManager' | 'logs' | 'config' | 'fetch' | 'sceneManager' | 'places' | 'names' | 'worlds',
      '/scene-admin'
    >,
    'components' | 'url' | 'verification' | 'request' | 'params'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, sceneAdminManager, sceneManager, places, names, worlds },
    url,
    verification
  } = ctx

  const logger = logs.getLogger('list-scene-admins-handler')
  const { getPlaceByWorldName, getPlaceByParcel } = places
  const { isSceneOwnerOrAdmin } = sceneManager
  const { fetchWorldActionPermissions } = worlds

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

  const isOwnerOrAdmin = await isSceneOwnerOrAdmin(place, authenticatedAddress)

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

  const extraAddresses = new Set<string>()
  let worldActionPermissions: PermissionsOverWorld | undefined

  isWorlds && (worldActionPermissions = await fetchWorldActionPermissions(place.world_name!))

  if (worldActionPermissions?.permissions.deployment.type === PermissionType.AllowList) {
    worldActionPermissions.permissions.deployment.wallets.forEach((wallet) => extraAddresses.add(wallet.toLowerCase()))
  }

  if (worldActionPermissions?.permissions.streaming.type === PermissionType.AllowList) {
    worldActionPermissions.permissions.streaming.wallets.forEach((wallet) => extraAddresses.add(wallet.toLowerCase()))
  }

  const ownerAddress = worldActionPermissions?.owner

  if (ownerAddress) {
    extraAddresses.add(ownerAddress.toLowerCase())
  }

  const allAddresses = [...new Set([...admins.map((admin) => admin.admin), ...extraAddresses])]
  const allNames = await names.getNamesFromAddresses(allAddresses)

  const adminsWithNames = admins.map((admin) => ({
    ...admin,
    name: allNames[admin.admin] || '',
    canBeRemoved: !extraAddresses.has(admin.admin)
  }))

  const extraAddressesNotInAdmins = [...extraAddresses].filter(
    (address) => !admins.some((admin) => admin.admin.toLowerCase() === address.toLowerCase())
  )

  const extraAdminsWithNames = extraAddressesNotInAdmins.map((address) => ({
    admin: address,
    name: allNames[address] || '',
    canBeRemoved: false
  }))

  return {
    status: 200,
    body: [...adminsWithNames, ...extraAdminsWithNames]
  }
}
