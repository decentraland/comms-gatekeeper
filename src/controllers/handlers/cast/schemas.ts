import type { Schema } from 'ajv'

export type StreamerTokenRequestBody = {
  token: string
  identity: string
}

export const StreamerTokenRequestSchema: Schema = {
  type: 'object',
  properties: {
    token: { type: 'string', pattern: '^\\S+.*$', maxLength: 256 },
    identity: { type: 'string', pattern: '^\\S+.*$', maxLength: 256 }
  },
  required: ['token', 'identity']
}

export type WatcherTokenRequestBody = {
  location: string
  identity: string
  parcel?: string
}

export const WatcherTokenRequestSchema: Schema = {
  type: 'object',
  properties: {
    location: { type: 'string', pattern: '^\\S+.*$', maxLength: 256 },
    identity: { type: 'string', pattern: '^\\S+.*$', maxLength: 256 },
    parcel: { type: 'string', pattern: '^\\S+.*$', maxLength: 256 }
  },
  required: ['location', 'identity']
}

export type PresentationBotTokenRequestBody = {
  streamingKey: string
}

export const PresentationBotTokenRequestSchema: Schema = {
  type: 'object',
  properties: {
    streamingKey: { type: 'string', pattern: '^\\S+.*$', maxLength: 256 }
  },
  required: ['streamingKey']
}
