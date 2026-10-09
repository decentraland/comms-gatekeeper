import { ScenePermissionOptions } from './scene-manager.type'
import { IBaseComponent } from '@well-known-components/interfaces'

// Shortened version of the WorldScene type from the worlds content server
export type WorldScene = {
  worldName: string
  deployer: string
  entityId: string
  parcels: string[]
  baseParcel?: string
}

// Metadata structure returned by the worlds content server /contents/:entityId endpoint
export type WorldSceneEntityMetadata = {
  worldConfiguration?: { name?: string; dclName?: string }
  scene: {
    base: string
    parcels: string[]
  }
}

/** A verified deployment identity and a parcel belonging to that deployment. */
export type ResolvedWorldScene = { sceneId: string; parcel: string }

export type IWorldComponent = IBaseComponent & {
  /** Verifies a world scene and returns both identifiers needed for its room and place. */
  resolveWorldScene(
    worldName: string,
    sceneId: string,
    parcel?: string,
    options?: { allowPreviousDeployment?: boolean }
  ): Promise<ResolvedWorldScene>
  /** Finds an active deployment in the specified world, including legacy entities without metadata. */
  fetchWorldSceneByEntityId(worldName: string, entityId: string): Promise<WorldScene | undefined>
  fetchWorldActionPermissions(
    worldName: string,
    options?: ScenePermissionOptions
  ): Promise<PermissionsOverWorld | undefined>
  fetchWorldSceneByPointer(worldName: string, pointer: string): Promise<WorldScene | undefined>
  fetchWorldSceneEntityMetadataById(entityId: string): Promise<WorldSceneEntityMetadata | undefined>
  /** Resolves legacy world-name scene IDs and returns the canonical lowercase content ID. */
  resolveWorldSceneId(
    worldName: string,
    sceneId: string,
    parcel?: string,
    options?: { allowPreviousDeployment?: boolean }
  ): Promise<string>
  fetchWorldSceneId(worldName: string): Promise<string>
  hasWorldOwnerPermission(authAddress: string, worldName: string, options?: ScenePermissionOptions): Promise<boolean>
  hasWorldStreamingPermission(
    authAddress: string,
    worldName: string,
    options?: ScenePermissionOptions
  ): Promise<boolean>
  hasWorldDeployPermission(authAddress: string, worldName: string, options?: ScenePermissionOptions): Promise<boolean>
  hasWorldAccessPermission(authAddress: string, worldName: string): Promise<boolean>
  getWorldParcelPermissions(
    address: string,
    worldName: string,
    permissionName: string,
    options?: ScenePermissionOptions
  ): Promise<string[] | undefined>
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
