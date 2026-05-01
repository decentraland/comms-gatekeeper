export class LandPermissionsNotFoundError extends Error {
  constructor(message: string = 'Land permissions not found for the given address and parcel') {
    super(message)
    this.name = 'LandPermissionsNotFoundError'
  }
}
