import { AppComponents } from '../types'
import { LandLeaseAuthorizations, ILandLeaseComponent, LandLeaseAuthorization } from '../types/land-lease.type'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes in milliseconds

export async function createLandLeaseComponent({
  fetch,
  logs
}: Pick<AppComponents, 'fetch' | 'logs'>): Promise<ILandLeaseComponent> {
  const logger = logs.getLogger('land-lease')
  const LINKER_SERVER_AUTHORIZATIONS_URL =
    'https://decentraland.github.io/linker-server-authorizations/authorizations.json'

  let cachedAuthorizations: LandLeaseAuthorizations | null = null
  let lastFetchTime = 0

  async function fetchAuthorizations(): Promise<LandLeaseAuthorizations> {
    try {
      const response = await fetch.fetch(LINKER_SERVER_AUTHORIZATIONS_URL)

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
    } catch (error) {
      logger.error('Failed to fetch land lease authorizations', { error: String(error) })
      throw error
    }
  }

  async function getAuthorizations(): Promise<LandLeaseAuthorizations> {
    const now = Date.now()

    // Check if the cache is valid
    if (cachedAuthorizations && now - lastFetchTime < CACHE_TTL) {
      return cachedAuthorizations
    }

    try {
      cachedAuthorizations = await fetchAuthorizations()
      lastFetchTime = now
      return cachedAuthorizations
    } catch (error) {
      if (cachedAuthorizations) {
        return cachedAuthorizations
      }
      return { authorizations: [] }
    }
  }

  async function hasLandLease(address: string, parcels: string[]): Promise<boolean> {
    try {
      const authorizations = await getAuthorizations()
      const normalizedAddress = address.toLowerCase()

      if (!authorizations?.authorizations) {
        return false
      }

      const userAuthorization = authorizations.authorizations.find((auth) =>
        auth.addresses.some((addr) => addr.toLowerCase() === normalizedAddress)
      )

      if (!userAuthorization) {
        return false
      }

      // Check if user has access to any of the parcels
      const hasAccess = parcels.some((parcel) => userAuthorization.plots.includes(parcel))

      if (hasAccess) {
        logger.info('Land lease access granted', { address: normalizedAddress, parcels: parcels.join(',') })
      }

      return hasAccess
    } catch (error) {
      logger.error('Error checking land lease permissions', { error: String(error) })
      return false
    }
  }

  async function refreshAuthorizations(): Promise<void> {
    cachedAuthorizations = null
    lastFetchTime = 0
    await getAuthorizations()
  }

  return {
    hasLandLease,
    getAuthorizations,
    refreshAuthorizations
  }
}
