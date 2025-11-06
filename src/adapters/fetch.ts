import { LRUCache } from 'lru-cache'
import { AppComponents } from '../types'
import { ICachedFetchComponent } from '../types/fetch.type'

export async function cachedFetchComponent(
  components: Pick<AppComponents, 'fetch' | 'logs'>,
  options?: {
    max?: number
    ttl?: number
    allowStaleOnFetchRejection?: boolean
  }
): Promise<ICachedFetchComponent> {
  const { fetch, logs } = components
  const max = options?.max ?? 1000
  const ttl = options?.ttl ?? 1000 * 60 * 5
  const allowStaleOnFetchRejection = options?.allowStaleOnFetchRejection ?? false

  const logger = logs.getLogger('cached-fetch-component')

  function cache<T extends object>() {
    return new LRUCache<string, T>({
      max,
      ttl,
      allowStaleOnFetchRejection,
      fetchMethod: async function (url: string, _staleValue: T | void): Promise<T> {
        try {
          const response = await fetch.fetch(url)

          if (!response.ok) {
            throw new Error(`Error getting ${url}, status: ${response.status}`)
          }

          return response.json()
        } catch (err: any) {
          logger.error(`Error getting ${url}`, { err })
          throw err
        }
      }
    })
  }

  return {
    cache
  }
}
