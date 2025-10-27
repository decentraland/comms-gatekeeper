import { JSONSchemaType } from 'ajv'

export type StreamerTokenRequestBody = {
  token: string
  identity: string
}

export const StreamerTokenRequestSchema: JSONSchemaType<StreamerTokenRequestBody> = {
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

export const WatcherTokenRequestSchema: JSONSchemaType<WatcherTokenRequestBody> = {
  type: 'object',
  properties: {
    location: { type: 'string', minLength: 1 },
    identity: { type: 'string', minLength: 1 }
  },
  required: ['location', 'identity']
}
