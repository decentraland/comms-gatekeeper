import { IBaseComponent } from '@well-known-components/interfaces'

export type IWorldComponent = IBaseComponent & {
  fetchWorldActionPermissions(worldName: string): Promise<PermissionsOverWorld | undefined>
  hasWorldOwnerPermission(authAddress: string, worldName: string): Promise<boolean>
  hasWorldStreamingPermission(authAddress: string, worldName: string): Promise<boolean>
  hasWorldDeployPermission(authAddress: string, worldName: string): Promise<boolean>
  hasWorldAccessPermission(authAddress: string, worldName: string): Promise<boolean>
}

export enum PermissionType {
  Unrestricted = 'unrestricted',
  SharedSecret = 'shared-secret',
  NFTOwnership = 'nft-ownership',
  AllowList = 'allow-list'
}

export type UnrestrictedPermissionSetting = {
  type: PermissionType.Unrestricted
}

export type SharedSecretPermissionSetting = {
  type: PermissionType.SharedSecret
  secret: string
}

export type NftOwnershipPermissionSetting = {
  type: PermissionType.NFTOwnership
  nft: string
}

export type AllowListPermissionSetting = {
  type: PermissionType.AllowList
  wallets: string[]
}

export type AccessPermissionSetting =
  | UnrestrictedPermissionSetting
  | SharedSecretPermissionSetting
  | NftOwnershipPermissionSetting
  | AllowListPermissionSetting

export type PermissionsOverWorld = {
  owner: string
  permissions: {
    deployment: AllowListPermissionSetting
    access: AccessPermissionSetting
    streaming: UnrestrictedPermissionSetting | AllowListPermissionSetting
  }
}
