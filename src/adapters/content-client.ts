import { LRUCache } from 'lru-cache'
import { ContentClient, createContentClient } from 'dcl-catalyst-client'
import { AppComponents } from '../types'
import { IContentClientComponent } from '../types/content-client.type'

export async function createContentClientComponent(
  components: Pick<AppComponents, 'config' | 'fetch' | 'logs'>
): Promise<IContentClientComponent> {
  const { config, fetch, logs } = components
  const max = (await config.getNumber('CONTENT_CLIENT_CACHE_MAX')) ?? 1000
  const ttl = (await config.getNumber('CONTENT_CLIENT_CACHE_TTL')) ?? 1000 * 60 * 5 // 5 minutes default

  const logger = logs.getLogger('cached-content-client-component')

  const catalystContentUrl = await config.requireString('CATALYST_CONTENT_URL')
  const catalyst: ContentClient = createContentClient({ url: catalystContentUrl, fetcher: fetch })

  const entityCache = new LRUCache<string, any>({
    max,
    ttl,
    fetchMethod: async function (sceneId: string): Promise<any> {
      try {
        logger.debug(`Fetching entity for sceneId: ${sceneId}`)
        const entity = await catalyst.fetchEntityById(sceneId)
        logger.debug(`Successfully fetched entity for sceneId: ${sceneId}`)
        return entity
      } catch (err: any) {
        logger.warn(`Error fetching entity for sceneId ${sceneId}:`, err)
        throw err
      }
    }
  })

  return {
    fetchEntityById: async (sceneId: string) => {
      return entityCache.fetch(sceneId)
    }
  }
}
