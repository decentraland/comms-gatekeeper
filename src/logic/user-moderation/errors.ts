export class PlayerAlreadyBannedError extends Error {
  constructor(address: string) {
    super(`Player is already banned: ${address}`)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class BanNotFoundError extends Error {
  constructor(address: string) {
    super(`No active ban found for player: ${address}`)
    Error.captureStackTrace(this, this.constructor)
  }
}
