import { IBaseComponent } from '@well-known-components/interfaces'
import { ContentClient } from 'dcl-catalyst-client'

export interface IContentClientComponent
  extends IBaseComponent,
    Pick<ContentClient, 'fetchEntityById' | 'fetchEntitiesByPointers'> {
  /** Bypass the pointer cache when verifying the active deployment for a mutation. */
  fetchEntitiesByPointers(
    pointers: string[],
    options?: Parameters<ContentClient['fetchEntitiesByPointers']>[1] & {
      skipCache?: boolean
      expectedEntityId?: string
    }
  ): ReturnType<ContentClient['fetchEntitiesByPointers']>
}
