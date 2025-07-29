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

export interface ILandLeaseComponent {
  hasLandLease(address: string, parcels: string[]): Promise<boolean>
  getAuthorizations(): Promise<LandLeaseAuthorizations>
  refreshAuthorizations(): Promise<void>
}
