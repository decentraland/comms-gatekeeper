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
  parcel?: string
}

export const WatcherTokenRequestSchema: Schema = {
  type: 'object',
  properties: {
    location: { type: 'string', pattern: '^\\S+.*$' },
    identity: { type: 'string', pattern: '^\\S+.*$' },
    parcel: { type: 'string', pattern: '^\\S+.*$' }
  },
  required: ['location', 'identity']
}

export type PresentationBotTokenRequestBody = {
  streamingKey: string
}

export const PresentationBotTokenRequestSchema: Schema = {
  type: 'object',
  properties: {
    streamingKey: { type: 'string', pattern: '^\\S+.*$' }
  },
  required: ['streamingKey']
}

export type PresenterActionRequestBody = {
  roomId: string
  participantIdentity: string
}

export const PresenterActionRequestSchema: Schema = {
  type: 'object',
  properties: {
    roomId: { type: 'string', pattern: '^\\S+.*$' },
    participantIdentity: { type: 'string', pattern: '^\\S+.*$' }
  },
  required: ['roomId', 'participantIdentity']
}
