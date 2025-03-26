import { IBaseComponent } from '@well-known-components/interfaces'
import { LRUCache } from 'lru-cache'

export type ExtendedLRUCache<T extends object> = LRUCache<string, T> & {
  fetch: (url: string) => Promise<T>
  post: (url: string, body?: Record<string, any>) => Promise<T>
}

export type ICachedFetchComponent = IBaseComponent & {
  cache: <T extends object>() => ExtendedLRUCache<T>
}
