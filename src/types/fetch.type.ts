import { IBaseComponent } from '@well-known-components/interfaces'
import { LRUCache } from 'lru-cache'

/** Optional loader for keyed POST requests or adapters with domain-specific error handling. */
export type CachedFetchLoader<T> = (() => Promise<T | undefined>) | void

export type ICachedFetchComponent = IBaseComponent & {
  cache: <T extends object>(options?: {
    ttl?: number
    allowStaleOnFetchRejection?: boolean
  }) => LRUCache<string, T, CachedFetchLoader<T>>
}
