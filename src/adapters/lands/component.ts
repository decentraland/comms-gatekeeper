import { ensureSlashAtTheEnd } from '../../logic/utils'
import { isErrorWithMessage } from '../../logic/errors'
import { AppComponents } from '../../types'
import { LandPermissionsNotFoundError } from './errors'
import {
  ILandComponent,
  LandLeaseAuthorizations,
  LandsParcelOperatorsResponse,
  LandsParcelPermissionsResponse
} from './types'

const LEASE_AUTHORIZATIONS_URL = 'https://decentraland.github.io/linker-server-authorizations/authorizations.json'
const LEASE_AUTHORIZATIONS_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function createLandsComponent(
  components: Pick<AppComponents, 'config' | 'cachedFetch' | 'fetch' | 'logs'>
): Promise<ILandComponent> {
  const { config, cachedFetch, fetch, logs } = components
  const logger = logs.getLogger('land-component')

  const lambdasUrl = await config.requireString('LAMBDAS_URL')

  const parcelPermissionsCache = cachedFetch.cache<LandsParcelPermissionsResponse>()
  const parcelOperatorsCache = cachedFetch.cache<LandsParcelOperatorsResponse>()

  // Lease-authorization cache state. Single in-flight fetch is deduped so
  // that a burst of callers doesn't fan out to the upstream service.
  let cachedAuthorizations: LandLeaseAuthorizations | null = null
  let lastAuthorizationsFetchTime = 0
  let inFlightAuthorizationsFetch: Promise<LandLeaseAuthorizations> | null = null

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

  async function fetchAuthorizationsFromUpstream(): Promise<LandLeaseAuthorizations> {
    const response = await fetch.fetch(LEASE_AUTHORIZATIONS_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch authorizations: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    if (!Array.isArray(data)) {
      throw new Error('Invalid response format from authorizations service - expected array')
    }

    return {
      authorizations: data.map((auth: any) => ({
        name: auth.name || '',
        desc: auth.desc || '',
        contactInfo: { name: auth.contactInfo?.name || '' },
        addresses: auth.addresses || [],
        plots: auth.plots || []
      }))
    }
  }

  async function getAuthorizations(): Promise<LandLeaseAuthorizations> {
    const now = Date.now()

    if (cachedAuthorizations && now - lastAuthorizationsFetchTime < LEASE_AUTHORIZATIONS_CACHE_TTL_MS) {
      return cachedAuthorizations
    }

    if (!inFlightAuthorizationsFetch) {
      const chain: Promise<LandLeaseAuthorizations> = fetchAuthorizationsFromUpstream()
        .then((result) => {
          cachedAuthorizations = result
          lastAuthorizationsFetchTime = Date.now()
          return result
        })
        .finally(() => {
          if (inFlightAuthorizationsFetch === chain) inFlightAuthorizationsFetch = null
        })
      inFlightAuthorizationsFetch = chain
    }

    try {
      return await inFlightAuthorizationsFetch
    } catch (error) {
      logger.error('Failed to fetch land lease authorizations', {
        error: isErrorWithMessage(error) ? error.message : String(error)
      })
      // Serve stale data on transient failures rather than propagating; if we
      // never had a successful fetch, callers see an empty list and degrade.
      if (cachedAuthorizations) {
        return cachedAuthorizations
      }
      return { authorizations: [] }
    }
  }

  async function hasLandLease(address: string, parcels: string[]): Promise<boolean> {
    try {
      const { authorizations } = await getAuthorizations()
      if (!authorizations) return false

      const normalizedAddress = address.toLowerCase()
      const hasAccess = authorizations.some(
        ({ addresses, plots }) =>
          addresses.some((addr) => addr.toLowerCase() === normalizedAddress) &&
          plots.some((plot) => parcels.includes(plot))
      )

      if (hasAccess) {
        logger.info('Land lease access granted', { address: normalizedAddress, parcels: parcels.join(',') })
      }
      return hasAccess
    } catch (error) {
      logger.error('Error checking land lease permissions', {
        error: isErrorWithMessage(error) ? error.message : String(error)
      })
      return false
    }
  }

  async function getLeaseHoldersForParcels(parcels: string[]): Promise<string[]> {
    if (parcels.length === 0) return []

    // Failures degrade to an empty list rather than propagating: callers fold
    // this into wider parallel fetches (see roomMetadataSync.refreshRoomMetadata),
    // and a flaky lease service should not cascade into dropping the entire
    // metadata write.
    try {
      const { authorizations } = await getAuthorizations()
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

  async function refreshAuthorizations(): Promise<void> {
    cachedAuthorizations = null
    lastAuthorizationsFetchTime = 0
    inFlightAuthorizationsFetch = null
    await getAuthorizations()
  }

  return {
    getLandPermissions,
    getLandOperators,
    hasLandLease,
    getLeaseHoldersForParcels,
    getAuthorizations,
    refreshAuthorizations
  }
}
