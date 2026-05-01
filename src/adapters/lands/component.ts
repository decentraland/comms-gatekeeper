import { ensureSlashAtTheEnd } from '../../logic/utils'
import { isErrorWithMessage } from '../../logic/errors'
import { AppComponents } from '../../types'
import { LandPermissionsNotFoundError } from './errors'
import { ILandComponent, LandsParcelOperatorsResponse, LandsParcelPermissionsResponse } from './types'

export async function createLandsComponent(
  components: Pick<AppComponents, 'config' | 'cachedFetch' | 'landLease' | 'logs'>
): Promise<ILandComponent> {
  const { config, cachedFetch, landLease, logs } = components
  const logger = logs.getLogger('land-component')

  const lambdasUrl = await config.requireString('LAMBDAS_URL')

  const parcelPermissionsCache = cachedFetch.cache<LandsParcelPermissionsResponse>()
  const parcelOperatorsCache = cachedFetch.cache<LandsParcelOperatorsResponse>()

  async function getLandPermissions(
    authAddress: string,
    placePositions: string[]
  ): Promise<LandsParcelPermissionsResponse> {
    const baseUrl = ensureSlashAtTheEnd(lambdasUrl)
    if (!baseUrl) {
      logger.error('Lambdas URL is not set')
      throw new Error('Lambdas URL is not set')
    }

    const position = placePositions[0].split(',')
    const parcelPermissionsResponse = await parcelPermissionsCache.fetch(
      `${baseUrl}users/${authAddress.toLowerCase()}/parcels/${position[0]}/${position[1]}/permissions`
    )

    if (!parcelPermissionsResponse) {
      logger.info(`Land permissions not found for ${authAddress} at ${position[0]},${position[1]}`)
      throw new LandPermissionsNotFoundError(
        `Land permissions not found for ${authAddress} at ${position[0]},${position[1]}`
      )
    }

    return parcelPermissionsResponse
  }

  async function getLandOperators(parcel: string): Promise<LandsParcelOperatorsResponse> {
    const baseUrl = ensureSlashAtTheEnd(lambdasUrl)
    if (!baseUrl) {
      logger.error('Lambdas URL is not set')
      throw new Error('Lambdas URL is not set')
    }
    const [x, y] = parcel.split(',')
    const parcelPermissionsResponse = await parcelOperatorsCache.fetch(`${baseUrl}parcels/${x}/${y}/operators`)

    if (!parcelPermissionsResponse) {
      logger.info(`Land permissions not found for ${x},${y}`)
      throw new LandPermissionsNotFoundError(`Land permissions not found for ${x},${y}`)
    }

    return parcelPermissionsResponse
  }

  async function getLeaseHoldersForParcels(parcels: string[]): Promise<string[]> {
    if (parcels.length === 0) return []

    // Failures degrade to an empty list rather than propagating: callers fold
    // this into wider parallel fetches (see roomMetadataSync.refreshRoomMetadata),
    // and a flaky lease service should not cascade into dropping the entire
    // metadata write.
    try {
      const { authorizations } = await landLease.getAuthorizations()
      if (!authorizations) return []

      const parcelSet = new Set(parcels)
      const leaseHolders = new Set<string>()
      for (const auth of authorizations) {
        const overlaps = auth.plots.some((plot) => parcelSet.has(plot))
        if (overlaps) {
          for (const address of auth.addresses) {
            leaseHolders.add(address.toLowerCase())
          }
        }
      }
      return Array.from(leaseHolders)
    } catch (error) {
      logger.warn(
        `Failed to fetch land-lease holders for parcels ${parcels.join(',')}: ${
          isErrorWithMessage(error) ? error.message : 'Unknown error'
        }`
      )
      return []
    }
  }

  return {
    getLandPermissions,
    getLandOperators,
    getLeaseHoldersForParcels
  }
}
