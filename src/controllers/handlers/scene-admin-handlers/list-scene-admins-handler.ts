import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { validate, validateFilters } from '../../../logic/utils'
import { PlaceAttributes } from '../../../types/places.type'

export async function listSceneAdminsHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'logs' | 'config' | 'fetch' | 'places' | 'names' | 'sceneAdmins' | 'landLease',
      '/scene-admin'
    >,
    'components' | 'url' | 'verification' | 'request' | 'params'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, config, places, names, sceneAdmins, landLease },
    url,
    verification
  } = ctx

  const logger = logs.getLogger('list-scene-admins-handler')
  const { getWorldScenePlace, getPlaceByParcel } = places

  if (!verification || verification?.auth === undefined) {
    logger.warn('Request without authentication')
    throw new UnauthorizedError('Authentication required')
  }

  const authenticatedAddress = verification.auth.toLowerCase()

  const {
    parcel,
    realm: { hostname, serverName }
  } = await validate(ctx)
  const authoritativeServerIdentity = await config.getString('AUTHORITATIVE_SERVER_ADDRESS')
  const isAuthoritativeServerIdentity =
    authoritativeServerIdentity && authenticatedAddress.toLowerCase() === authoritativeServerIdentity.toLowerCase()

  const isWorld = hostname.includes('worlds-content-server')

  let place: PlaceAttributes
  if (isWorld) {
    place = await getWorldScenePlace(serverName, parcel)
  } else {
    place = await getPlaceByParcel(parcel)
  }

  // Allow any authenticated scene participant to list admins.
  // This enables all clients to validate admin identity for applying changes.
  if (isAuthoritativeServerIdentity) {
    logger.debug(`Authoritative server ${authenticatedAddress} requesting scene admins for place ${place.id}`)
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
  if (!isWorld) {
    const { authorizations } = await landLease.getAuthorizations()
    if (authorizations) {
      for (const auth of authorizations) {
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
