import { LRUCache } from 'lru-cache'
import { AppComponents } from '../types'
import { ICachedFetchComponent } from '../types/fetch.type'

export async function cachedFetchComponent(
  components: Pick<AppComponents, 'fetch' | 'logs'>
): Promise<ICachedFetchComponent> {
  const { fetch, logs } = components

  const logger = logs.getLogger('cached-fetch-component')

  function cache<T extends object>() {
    return new LRUCache<string, T>({
      max: 1000,
      ttl: 1000 * 60 * 5, // 5 min,
      fetchMethod: async function (url: string, _staleValue: T | void): Promise<T> {
        try {
          const response = await fetch.fetch(url)

          if (!response.ok) {
            throw new Error(`Error getting ${url}`)
          }

          const data = await response.json()
          logger.log(data)
          return data
        } catch (err: any) {
          logger.warn(err)
          throw err
        }
      }
    })
  }

  return {
    cache
  }
}
