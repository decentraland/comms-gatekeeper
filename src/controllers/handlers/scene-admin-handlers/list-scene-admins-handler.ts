import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { validate, validateFilters } from '../../../logic/utils'
import { PlaceAttributes } from '../../../types/places.type'

export async function listSceneAdminsHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'logs' | 'config' | 'fetch' | 'sceneManager' | 'places' | 'names' | 'sceneAdmins' | 'landLease',
      '/scene-admin'
    >,
    'components' | 'url' | 'verification' | 'request' | 'params'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, sceneManager, places, names, sceneAdmins, landLease },
    url,
    verification
  } = ctx

  const logger = logs.getLogger('list-scene-admins-handler')
  const { getPlaceByWorldName, getPlaceByParcel } = places
  const { isSceneOwnerOrAdmin } = sceneManager

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

  const allAddresses = await sceneAdmins.getAdminsAndExtraAddresses(place, validationResult.value.admin)

  // Get land lease owners
  const landLeaseOwners = new Set<string>()
  if (!isWorlds) {
    const authorizations = await landLease.getAuthorizations()
    if (authorizations?.authorizations) {
      for (const auth of authorizations.authorizations) {
        const existLease = place.positions.some((position) => auth.plots.includes(position))
        if (existLease) {
          auth.addresses.forEach((address: string) => landLeaseOwners.add(address.toLowerCase()))
        }
      }
    }
  }

  // Combine all addresses including land lease owners
  const allAddressesWithLandLease = new Set([...allAddresses.addresses, ...landLeaseOwners])

  const allNames = await names.getNamesFromAddresses(Array.from(allAddressesWithLandLease))

  const adminsWithNames = Array.from(allAddresses.admins).map((admin) => ({
    ...admin,
    name: allNames[admin.admin] || '',
    canBeRemoved: !allAddresses.extraAddresses.has(admin.admin)
  }))

  const extraAdminsWithNames = Array.from(allAddresses.extraAddresses).map((address) => ({
    admin: address,
    name: allNames[address] || '',
    canBeRemoved: false
  }))

  // Add land lease owners
  const landLeaseOwnersWithNames = Array.from(landLeaseOwners).map((address) => ({
    admin: address,
    name: allNames[address] || '',
    canBeRemoved: false // Land lease owners cannot be removed
  }))

  return {
    status: 200,
    body: [...adminsWithNames, ...extraAdminsWithNames, ...landLeaseOwnersWithNames]
  }
}
