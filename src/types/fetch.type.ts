import { IBaseComponent } from '@well-known-components/interfaces'
import { LRUCache } from 'lru-cache'

export type ICachedFetchComponent = IBaseComponent & {
  cache: <T extends object>() => LRUCache<string, T>
}
