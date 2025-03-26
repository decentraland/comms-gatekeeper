import { IBaseComponent } from '@well-known-components/interfaces'

export interface LandsParcelPermissionsResponse {
  operator: boolean
  owner: boolean
}

export type ILandComponent = IBaseComponent & {
  getLandUpdatePermission(authAddress: string, placePositions: string[]): Promise<LandsParcelPermissionsResponse>
}
