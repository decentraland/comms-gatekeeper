import { LRUCache } from 'lru-cache'
import { ContentClient, createContentClient } from 'dcl-catalyst-client'
import { Entity } from '@dcl/schemas'
import { AppComponents } from '../types'
import { PlaceNotFoundError, ServiceUnavailableError } from '../types/errors'
import { getErrorMessage } from '../logic/errors'
import { IContentClientComponent } from '../types/content-client.type'

type CacheKey = `id:${string}` | `ptr:${string}`
type CacheValue = Entity | Entity[]

export async function createContentClientComponent(
  components: Pick<AppComponents, 'config' | 'fetch' | 'logs'>
): Promise<IContentClientComponent> {
  const { config, fetch, logs } = components
  const max = (await config.getNumber('CONTENT_CLIENT_CACHE_MAX')) ?? 1000
  const ttl = (await config.getNumber('CONTENT_CLIENT_CACHE_TTL')) ?? 1000 * 60 * 5 // 5 minutes default

  const requestTimeout = (await config.getNumber('CATALYST_REQUEST_TIMEOUT_MS')) ?? 5000
  const negativeTtl = (await config.getNumber('CONTENT_CLIENT_NEGATIVE_CACHE_TTL')) ?? 5000
  // Cache confirmed misses briefly so a newly synced deployment can be retried promptly.
  // Transient upstream failures are never negative-cached.
  const missingEntities = new LRUCache<string, true>({ max, ttl: negativeTtl })

  const logger = logs.getLogger('cached-content-client-component')

  const catalystContentUrl = await config.requireString('CATALYST_CONTENT_URL')
  const client: ContentClient = createContentClient({ url: catalystContentUrl, fetcher: fetch })
  // Only operator-configured servers are trusted; never use a caller-supplied realm URL.
  const fallbackUrls =
    (await config.getString('CATALYST_FALLBACK_CONTENT_URLS'))
      ?.split(',')
      .map((url) => url.trim())
      .filter(Boolean) ?? []
  const entityClients = [
    client,
    ...fallbackUrls
      .filter((url) => url !== catalystContentUrl)
      .map((url) => createContentClient({ url, fetcher: fetch }))
  ]

  async function fetchEntityFromTrustedServers(sceneId: string): Promise<Entity> {
    let unavailable = false
    for (const entityClient of entityClients) {
      try {
        const entities = await entityClient.fetchEntitiesByIds([sceneId], { attempts: 1, timeout: requestTimeout })
        const entity = entities.find((candidate) => candidate.id === sceneId)
        if (entity) return entity
      } catch (error) {
        unavailable = true
        logger.warn('Trusted content lookup failed', { sceneId, error: getErrorMessage(error) })
      }
    }
    if (unavailable)
      throw new ServiceUnavailableError('Scene verification is temporarily unavailable; retry after content sync')
    missingEntities.set(sceneId, true)
    throw new PlaceNotFoundError(`Scene ${sceneId} is not available on the trusted content servers yet`)
  }

  const cache = new LRUCache<CacheKey, CacheValue>({
    max,
    ttl,
    fetchMethod: async function (key: CacheKey): Promise<CacheValue> {
      try {
        if (key.startsWith('id:')) {
          const sceneId = key.slice('id:'.length)
          logger.debug(`Fetching entity for sceneId: ${sceneId}`)
          const entity = await fetchEntityFromTrustedServers(sceneId)
          logger.debug(`Successfully fetched entity for sceneId: ${sceneId}`)
          return entity
        }

        if (key.startsWith('ptr:')) {
          const pointer = key.slice('ptr:'.length)
          logger.debug(`Fetching entity for pointer: ${pointer}`)
          const entities = await client.fetchEntitiesByPointers([pointer])
          logger.debug(`Successfully fetched ${entities.length} entities for pointer: ${pointer}`)
          return entities
        }

        throw new Error(`Unknown cache key: ${key}`)
      } catch (err: any) {
        logger.warn(`Error fetching for key ${key}:`, err)
        throw err
      }
    }
  })

  return {
    fetchEntityById: async (sceneId: string) => {
      if (missingEntities.has(sceneId)) {
        throw new PlaceNotFoundError(`Scene ${sceneId} is not available on the trusted content servers yet`)
      }
      return cache.fetch(`id:${sceneId}`) as Promise<Entity | undefined>
    },
    fetchEntitiesByPointers: async (pointers, options) => {
      if (options?.skipCache) {
        const results = await Promise.allSettled(
          entityClients.map((entityClient) =>
            entityClient.fetchEntitiesByPointers(pointers, { timeout: requestTimeout, attempts: 1 })
          )
        )
        for (const result of results) {
          if (
            result.status === 'fulfilled' &&
            (!options.expectedEntityId || result.value.some((entity) => entity.id === options.expectedEntityId))
          ) {
            return result.value
          }
        }
        // A successful trusted response confirms absence; an outage of every server is retryable.
        if (results.every((result) => result.status === 'rejected')) {
          throw new ServiceUnavailableError('Active scene verification is temporarily unavailable')
        }
        return []
      }
      const result = await cache.fetch(`ptr:${pointers[0]}`)
      return (result as Entity[]) ?? []
    }
  }
}
