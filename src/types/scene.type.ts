import { IBaseComponent } from '@well-known-components/interfaces'
import { PlaceAttributes } from './places.type'
import { SceneAdmin } from '../types'

export type ISceneAdmins = IBaseComponent & {
  getAdminsAndExtraAddresses: (
    place: Pick<PlaceAttributes, 'id' | 'world' | 'world_name' | 'base_position'>,
    admin?: string
  ) => Promise<{
    admins: Set<SceneAdmin>
    extraAddresses: Set<string>
    addresses: Set<string>
  }>
}
