import { IBaseComponent } from '@well-known-components/interfaces'

export type LandsParcelPermissionsResponse = {
  operator: boolean
  owner: boolean
}

export type ILandComponent = IBaseComponent & {
  getLandUpdatePermission(authAddress: string, placePositions: string[]): Promise<LandsParcelPermissionsResponse>
}
