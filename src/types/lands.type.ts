import { IBaseComponent } from '@well-known-components/interfaces'

export type LandsParcelPermissionsResponse = {
  owner: boolean
  operator: boolean
  updateOperator: boolean
  updateManager: boolean
  approvedForAll: boolean
}

export type LandsParcelOperatorsResponse = {
  owner: string
  operator: string | null
  updateOperators: string | null
  updateManagers: string[]
  approvedForAll: string[]
}

export type ILandComponent = IBaseComponent & {
  getLandPermissions(authAddress: string, placePositions: string[]): Promise<LandsParcelPermissionsResponse>
  getLandOperators(parcel: string): Promise<LandsParcelOperatorsResponse>
}
