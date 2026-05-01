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
  updateOperator: string | null
  updateManagers: string[]
  approvedForAll: string[]
}

export interface LandLeaseAuthorization {
  name: string
  desc: string
  contactInfo: { name: string }
  addresses: string[]
  plots: string[]
}

export interface LandLeaseAuthorizations {
  authorizations: LandLeaseAuthorization[]
}

export type ILandComponent = IBaseComponent & {
  /**
   * Returns the caller's permissions on the first of the given parcels.
   * Throws `LandPermissionsNotFoundError` when the lambdas service has no
   * record for the parcel.
   */
  getLandPermissions(authAddress: string, placePositions: string[]): Promise<LandsParcelPermissionsResponse>

  /**
   * Returns the on-chain operators (owner / operator / updateOperator /
   * updateManagers / approvedForAll) for a single parcel.
   * Throws `LandPermissionsNotFoundError` when the lambdas service has no
   * record for the parcel.
   */
  getLandOperators(parcel: string): Promise<LandsParcelOperatorsResponse>

  /**
   * Returns whether `address` is authorized to lease any of `parcels`.
   * Off-chain lease authorizations are sourced from a static linker-server
   * JSON, cached locally for ~5 minutes. Failures are logged and degrade
   * to `false` rather than propagating.
   */
  hasLandLease(address: string, parcels: string[]): Promise<boolean>

  /**
   * Returns the lowercase addresses authorized to lease any of the given
   * parcels. Empty array when none of the parcels overlap a known lease, or
   * when the underlying authorizations lookup fails — failures are logged
   * and swallowed so callers can fold this into a wider parallel fetch
   * without one flaky source poisoning the rest.
   */
  getLeaseHoldersForParcels(parcels: string[]): Promise<string[]>

  /**
   * Returns the raw lease-authorization document. Cached for ~5 minutes;
   * concurrent callers share a single in-flight fetch.
   */
  getAuthorizations(): Promise<LandLeaseAuthorizations>

  /**
   * Drops the cached lease-authorization document and triggers a fresh
   * fetch. Intended for tests and admin tooling.
   */
  refreshAuthorizations(): Promise<void>
}
