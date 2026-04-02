/**
 * Thrown when a streaming key is not found or does not match any active stream access record.
 */
export class InvalidStreamingKeyError extends Error {
  constructor(message = 'Invalid or expired streaming token') {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Thrown when a streaming key exists but has passed its expiration time.
 */
export class ExpiredStreamingKeyError extends Error {
  constructor(message = 'Streaming token has expired') {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Thrown when no active stream access exists for a given room or location.
 */
export class NoActiveStreamError extends Error {
  constructor(location: string) {
    super(`No active stream found for ${location}`)
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Thrown when a caller attempts an admin-only action without scene admin permissions.
 */
export class NotSceneAdminError extends Error {
  constructor(message = 'Only scene administrators can perform this action') {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Thrown when stream access exists but has passed its expiration time.
 */
export class ExpiredStreamAccessError extends Error {
  constructor(message = 'Stream access has expired. Please generate a new stream link.') {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}
