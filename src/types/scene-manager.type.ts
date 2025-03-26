import { IBaseComponent } from '@well-known-components/interfaces'
import { PlaceAttributes } from './places.type'

export type UserScenePermissions = {
  owner: boolean
  admin: boolean
  hasExtendedPermissions: boolean
}

export type ISceneManager = IBaseComponent & {
  isSceneOwner: (place: PlaceAttributes, address: string) => Promise<boolean>
  resolveUserScenePermissions: (place: PlaceAttributes, address: string) => Promise<UserScenePermissions>
}
