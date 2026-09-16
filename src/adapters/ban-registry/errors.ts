export class BanRegistryNotLoadedError extends Error {
  constructor() {
    super('The ban registry has not loaded the active bans yet')
    this.name = 'BanRegistryNotLoadedError'
  }
}
