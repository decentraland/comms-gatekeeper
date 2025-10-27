import type { Schema } from 'ajv'

export type StreamerTokenRequestBody = {
  token: string
  identity: string
}

export const StreamerTokenRequestSchema: Schema = {
  type: 'object',
  properties: {
    token: { type: 'string', minLength: 1 },
    identity: { type: 'string', minLength: 1 }
  },
  required: ['token', 'identity']
}

export type WatcherTokenRequestBody = {
  location: string
  identity: string
}

export const WatcherTokenRequestSchema: Schema = {
  type: 'object',
  properties: {
    location: { type: 'string', minLength: 1 },
    identity: { type: 'string', minLength: 1 }
  },
  required: ['location', 'identity']
}
