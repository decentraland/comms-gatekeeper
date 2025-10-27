import type { Schema } from 'ajv'

export type StreamerTokenRequestBody = {
  token: string
  identity: string
}

export const StreamerTokenRequestSchema: Schema = {
  type: 'object',
  properties: {
    token: { type: 'string', pattern: '^\\S+.*$' },
    identity: { type: 'string', pattern: '^\\S+.*$' }
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
    location: { type: 'string', pattern: '^\\S+.*$' },
    identity: { type: 'string', pattern: '^\\S+.*$' }
  },
  required: ['location', 'identity']
}
