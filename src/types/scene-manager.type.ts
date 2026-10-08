import { IBaseComponent } from '@well-known-components/interfaces'
import { PlaceAttributes } from './places.type'

/** Permission reads can use a short cache; mutations bypass it. Stale leases are only for target protection. */
export type ScenePermissionOptions = {
  /** Refresh upstream data for a mutation; never use stale lease fallback. */
  skipCache?: boolean
  /** Limit permission reads to ten seconds; database scene-admin checks remain fresh. */
  shortCache?: boolean
  /** Only protect ban targets: allow a previously verified lease document up to five minutes old on failure. */
  allowStaleLease?: boolean
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
