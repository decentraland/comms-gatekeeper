import { IBaseComponent } from '@well-known-components/interfaces'
import { PlaceAttributes } from './places.type'

export type ISceneAdmins = IBaseComponent & {
  getAdminsAndExtraAddresses: (
    place: Pick<PlaceAttributes, 'id' | 'world' | 'world_name' | 'base_position'>,
    admin?: string
  ) => Promise<{
    admins: Set<string>
    extraAddresses: Set<string>
    addresses: string[]
  }>
}
