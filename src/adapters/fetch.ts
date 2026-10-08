import { LRUCache } from 'lru-cache'
import { ServiceUnavailableError } from '../types/errors'
import { AppComponents } from '../types'
import { CachedFetchLoader, ICachedFetchComponent } from '../types/fetch.type'

export async function cachedFetchComponent(
  components: Pick<AppComponents, 'fetch' | 'logs'>,
  options?: {
    max?: number
    ttl?: number
    allowStaleOnFetchRejection?: boolean
  }
): Promise<ICachedFetchComponent> {
  const { fetch, logs } = components
  const max = options?.max ?? 5000
  const ttl = options?.ttl ?? 1000 * 60 * 5
  const allowStaleOnFetchRejection = options?.allowStaleOnFetchRejection ?? false

  const logger = logs.getLogger('cached-fetch-component')

  function cache<T extends object>(cacheOptions?: { ttl?: number; allowStaleOnFetchRejection?: boolean }) {
    return new LRUCache<string, T, CachedFetchLoader<T>>({
      max,
      ttl: cacheOptions?.ttl ?? ttl,
      allowStaleOnFetchRejection: cacheOptions?.allowStaleOnFetchRejection ?? allowStaleOnFetchRejection,
      fetchMethod: async function (url, _staleValue, { context }): Promise<T | undefined> {
        if (context) return context()
        try {
          const response = await fetch.fetch(url, { signal: AbortSignal.timeout(5000) })

          if (!response.ok) {
            // Release the undici response body before discarding it on the error path,
            // otherwise the socket stays checked out of the pool with its bytes buffered.
            await response.body?.cancel().catch(() => undefined)
            throw new Error(`Error getting ${url}, status: ${response.status}`)
          }

          return await response.json()
        } catch (err: any) {
          logger.warn(err)
          throw new ServiceUnavailableError('Upstream data is temporarily unavailable')
        }
      }
    })
  }

  return {
    cache
  }
}
