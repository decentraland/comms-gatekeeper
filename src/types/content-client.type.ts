import { Entity } from '@dcl/schemas'
import { IBaseComponent } from '@well-known-components/interfaces'
import { ContentClient } from 'dcl-catalyst-client'

export interface IContentClientComponent
  extends IBaseComponent,
    Pick<ContentClient, 'fetchEntityById' | 'fetchEntitiesByPointers'> {
  /**
   * Resolves a scene's navmap thumbnail to a URL a client can load.
   *
   * A relative value names a file the scene uploaded, so it is looked up in the entity's content
   * list and rewritten to this catalyst's `/contents/{hash}`; an absolute one is already a URL
   * and is returned as it stands. A relative value with no matching file is dropped rather than
   * returned as an unloadable path.
   *
   * @param scene - The scene entity.
   * @returns The thumbnail URL, or `undefined` when the scene has none that resolves.
   */
  calculateThumbnail(scene: Entity): string | undefined
}
