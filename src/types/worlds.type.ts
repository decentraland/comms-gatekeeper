import { IBaseComponent } from '@well-known-components/interfaces'

// Shortened version of the WorldScene type from the worlds content server
export type WorldScene = {
  worldName: string
  deployer: string
  entityId: string
  parcels: string[]
}

// Metadata structure returned by the worlds content server /contents/:entityId endpoint
export type WorldSceneEntityMetadata = {
  scene: {
    base: string
    parcels: string[]
  }
}

export type IWorldComponent = IBaseComponent & {
  fetchWorldActionPermissions(worldName: string): Promise<PermissionsOverWorld | undefined>
  fetchWorldSceneByPointer(worldName: string, pointer: string): Promise<WorldScene | undefined>
  fetchWorldSceneEntityMetadataById(entityId: string): Promise<WorldSceneEntityMetadata | undefined>
  fetchWorldSceneId(worldName: string): Promise<string>
  hasWorldOwnerPermission(authAddress: string, worldName: string): Promise<boolean>
  hasWorldStreamingPermission(authAddress: string, worldName: string): Promise<boolean>
  hasWorldDeployPermission(authAddress: string, worldName: string): Promise<boolean>
  hasWorldAccessPermission(authAddress: string, worldName: string): Promise<boolean>
  getWorldParcelPermissions(address: string, worldName: string, permissionName: string): Promise<string[]>
  getWorldParcelPermissionAddresses(worldName: string, permissionName: string, parcels: string[]): Promise<string[]>
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
