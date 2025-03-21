import { IBaseComponent } from '@well-known-components/interfaces'
import { PlaceAttributes } from './places.type'

export type ISceneManager = IBaseComponent & {
  isSceneOwner: (place: PlaceAttributes, address: string) => Promise<boolean>
  hasPermissionPrivilege: (place: PlaceAttributes, address: string) => Promise<boolean>
}
