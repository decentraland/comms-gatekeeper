import { IBaseComponent } from '@well-known-components/interfaces'

export type ILandComponent = IBaseComponent & {
  hasLandUpdatePermission(authAddress: string, placePositions: string[]): Promise<boolean>
}
