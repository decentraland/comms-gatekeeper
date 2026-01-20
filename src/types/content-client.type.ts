import { IBaseComponent } from '@well-known-components/interfaces'
import { ContentClient } from 'dcl-catalyst-client'

export interface IContentClientComponent
  extends IBaseComponent,
    Pick<ContentClient, 'fetchEntityById' | 'fetchEntitiesByPointers'> {}
