import { IBaseComponent } from '@well-known-components/interfaces'
import { PlaceAttributes } from './places.type'

export type ISceneManager = IBaseComponent & {
  isSceneOwner: (place: PlaceAttributes, address: string) => Promise<boolean>
  isSceneOwnerOrAdmin: (place: PlaceAttributes, address: string) => Promise<boolean>
}
