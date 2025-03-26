import { LRUCache } from 'lru-cache'
import { AppComponents } from '../types'
import { ExtendedLRUCache, ICachedFetchComponent } from '../types/fetch.type'

export async function cachedFetchComponent(
  components: Pick<AppComponents, 'fetch' | 'logs'>
): Promise<ICachedFetchComponent> {
  const { fetch, logs } = components

  const logger = logs.getLogger('cached-fetch-component')

  function cache<T extends object>() {
    const lruCache = new LRUCache<string, T>({
      max: 1000,
      ttl: 1000 * 60 * 5, // 5 min,
      fetchMethod: async function (url: string, _staleValue: T | void): Promise<T> {
        try {
          const response = await fetch.fetch(url, { method: 'GET' })

          if (!response.ok) {
            throw new Error(`Error getting ${url}`)
          }

          return response.json()
        } catch (err: any) {
          logger.warn(err)
          throw err
        }
      }
    })

    const extendedCache = {
      ...lruCache,
      fetch: async (url: string): Promise<T> => {
        const result = (await lruCache.fetch(url)) as T
        return result
      },
      post: async (url: string, body?: Record<string, any>): Promise<T> => {
        try {
          const requestOptions: Record<string, any> = { method: 'POST' }

          if (body) {
            requestOptions.body = JSON.stringify(body)
            requestOptions.headers = {
              'Content-Type': 'application/json'
            }
          }

          const response = await fetch.fetch(url, requestOptions)

          if (!response.ok) {
            throw new Error(`Error getting ${url}`)
          }

          return response.json()
        } catch (err: any) {
          logger.warn(err)
          throw err
        }
      }
    } as ExtendedLRUCache<T>

    return extendedCache
  }

  return {
    cache
  }
}
