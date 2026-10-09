import { IBaseComponent } from '@well-known-components/interfaces'
import { PlaceAttributes } from './places.type'

/** Permission reads can use cached data; mutation callers bypass it. */
export type ScenePermissionOptions = {
  /** Refresh upstream data for a mutation; never use stale lease data. */
  skipCache?: boolean
  /** Cache permission reads for ten seconds, or five minutes for leases; database scene-admin checks remain fresh. */
  shortCache?: boolean
}

export type UserScenePermissions = {
  owner: boolean
  admin: boolean
  hasExtendedPermissions: boolean
  hasLandLease: boolean
}

export type ISceneManager = IBaseComponent & {
  isSceneOwner: (place: PlaceAttributes, address: string, options?: ScenePermissionOptions) => Promise<boolean>
  getUserScenePermissions: (
    place: PlaceAttributes,
    address: string,
    options?: ScenePermissionOptions
  ) => Promise<UserScenePermissions>
  isSceneOwnerOrAdmin: (place: PlaceAttributes, address: string, options?: ScenePermissionOptions) => Promise<boolean>
}
