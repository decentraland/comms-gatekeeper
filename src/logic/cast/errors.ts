export class InvalidStreamingKeyError extends Error {
  constructor(message = 'Invalid or expired streaming token') {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ExpiredStreamingKeyError extends Error {
  constructor(message = 'Streaming token has expired') {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class NoActiveStreamError extends Error {
  constructor(location: string) {
    super(`No active stream found for ${location}`)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class NotSceneAdminError extends Error {
  constructor(message = 'Only scene administrators can perform this action') {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ExpiredStreamAccessError extends Error {
  constructor(message = 'Stream access has expired. Please generate a new stream link.') {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}
