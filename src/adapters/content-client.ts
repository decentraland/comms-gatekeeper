import { LRUCache } from 'lru-cache'
import { ContentClient, createContentClient } from 'dcl-catalyst-client'
import { Entity } from '@dcl/schemas'
import { AppComponents } from '../types'
import { IContentClientComponent } from '../types/content-client.type'

type CacheKey = `id:${string}` | `ptr:${string}`
type CacheValue = Entity | Entity[]

export async function createContentClientComponent(
  components: Pick<AppComponents, 'config' | 'fetch' | 'logs'>
): Promise<IContentClientComponent> {
  const { config, fetch, logs } = components
  const max = (await config.getNumber('CONTENT_CLIENT_CACHE_MAX')) ?? 1000
  const ttl = (await config.getNumber('CONTENT_CLIENT_CACHE_TTL')) ?? 1000 * 60 * 5 // 5 minutes default

  const logger = logs.getLogger('cached-content-client-component')

  const catalystContentUrl = await config.requireString('CATALYST_CONTENT_URL')
  const client: ContentClient = createContentClient({ url: catalystContentUrl, fetcher: fetch })

  const cache = new LRUCache<CacheKey, CacheValue>({
    max,
    ttl,
    fetchMethod: async function (key: CacheKey): Promise<CacheValue> {
      try {
        if (key.startsWith('id:')) {
          const sceneId = key.slice('id:'.length)
          logger.debug(`Fetching entity for sceneId: ${sceneId}`)
          const entity = await client.fetchEntityById(sceneId)
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
      return cache.fetch(`id:${sceneId}`) as Promise<Entity | undefined>
    },
    fetchEntitiesByPointers: async (pointers: string[]) => {
      const result = await cache.fetch(`ptr:${pointers[0]}`)
      return (result as Entity[]) ?? []
    }
  }
}
