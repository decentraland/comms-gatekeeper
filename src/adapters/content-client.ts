import { LRUCache } from 'lru-cache'
import { ContentClient, createContentClient } from 'dcl-catalyst-client'
import { Entity } from '@dcl/schemas'
import { AppComponents } from '../types'
import { IContentClientComponent } from '../types/content-client.type'

/** Cached pointer resolution. `null` is a remembered miss: no scene is deployed on that pointer. */
type CachedPointer = { entity: Entity | null }

export async function createContentClientComponent(
  components: Pick<AppComponents, 'config' | 'fetch' | 'logs'>
): Promise<IContentClientComponent> {
  const { config, fetch, logs } = components
  const max = (await config.getNumber('CONTENT_CLIENT_CACHE_MAX')) ?? 1000
  const ttl = (await config.getNumber('CONTENT_CLIENT_CACHE_TTL')) ?? 1000 * 60 * 5 // 5 minutes default

  const logger = logs.getLogger('cached-content-client-component')

  const catalystContentUrl = await config.requireString('CATALYST_CONTENT_URL')
  const client: ContentClient = createContentClient({ url: catalystContentUrl, fetcher: fetch })

  const entityByIdCache = new LRUCache<string, Entity>({
    max,
    ttl,
    fetchMethod: async function (sceneId: string): Promise<Entity> {
      try {
        logger.debug(`Fetching entity for sceneId: ${sceneId}`)
        const entity = await client.fetchEntityById(sceneId)
        logger.debug(`Successfully fetched entity for sceneId: ${sceneId}`)
        return entity
      } catch (err: any) {
        logger.warn(`Error fetching entity for sceneId ${sceneId}:`, err)
        throw err
      }
    }
  })

  // Cached per pointer rather than per request, so a batch of tiles (/hot-scenes asks for every
  // occupied one) only costs the catalyst the tiles nobody has looked up recently.
  const entityByPointerCache = new LRUCache<string, CachedPointer>({ max, ttl })

  async function fetchEntitiesByPointers(pointers: string[]): Promise<Entity[]> {
    if (pointers.length === 0) {
      return []
    }

    // Keyed by entity id: one scene covers several pointers, and the caller wants each scene once.
    const found = new Map<string, Entity>()
    const missing: string[] = []

    for (const pointer of pointers) {
      const cached = entityByPointerCache.get(pointer)
      if (!cached) {
        missing.push(pointer)
      } else if (cached.entity) {
        found.set(cached.entity.id, cached.entity)
      }
    }

    if (missing.length > 0) {
      logger.debug(`Fetching ${missing.length} of ${pointers.length} pointers from the catalyst`)

      let entities: Entity[]
      try {
        entities = await client.fetchEntitiesByPointers(missing)
      } catch (err: any) {
        logger.warn(`Error fetching entities for ${missing.length} pointers:`, err)
        throw err
      }

      const resolved = new Set<string>()
      for (const entity of entities) {
        found.set(entity.id, entity)
        for (const pointer of entity.pointers ?? []) {
          entityByPointerCache.set(pointer, { entity })
          resolved.add(pointer)
        }
      }

      // Remembered as misses too: an empty parcel is the common case for the tiles /hot-scenes
      // asks about, and re-asking the catalyst for them every refresh is the whole cost.
      for (const pointer of missing) {
        if (!resolved.has(pointer)) {
          entityByPointerCache.set(pointer, { entity: null })
        }
      }
    }

    return [...found.values()]
  }

  function calculateThumbnail(scene: Entity): string | undefined {
    let thumbnail: string | undefined = scene.metadata?.display?.navmapThumbnail
    if (thumbnail && !thumbnail.startsWith('http')) {
      // We are assuming that the thumbnail is an uploaded file. We will try to find the matching hash
      const thumbnailHash = scene.content?.find(({ file }) => file === thumbnail)?.hash
      if (thumbnailHash) {
        thumbnail = `${catalystContentUrl}/contents/${thumbnailHash}`
      } else {
        // If we couldn't find a file with the correct path, then we ignore whatever was set on the thumbnail property
        thumbnail = undefined
      }
    }
    return thumbnail
  }

  return {
    fetchEntityById: async (sceneId: string) => {
      return entityByIdCache.fetch(sceneId) as Promise<Entity>
    },
    fetchEntitiesByPointers,
    calculateThumbnail
  }
}
