import { IBaseComponent } from '@well-known-components/interfaces'

export type ILandComponent = IBaseComponent & {
  hasLandPermission(authAddress: string, placePositions: string[]): Promise<boolean>
}
