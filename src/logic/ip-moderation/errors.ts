export class IpAlreadyBannedError extends Error {
  constructor(ip: string) {
    super(`IP is already banned: ${ip}`)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class IpBanNotFoundError extends Error {
  constructor(ip: string) {
    super(`No active ban found for IP: ${ip}`)
    Error.captureStackTrace(this, this.constructor)
  }
}
