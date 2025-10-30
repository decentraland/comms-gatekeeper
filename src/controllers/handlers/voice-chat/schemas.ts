import type { Schema } from 'ajv'

export type PrivateVoiceChatRequestBody = {
  user_addresses: string[]
  room_id: string
}

export const PrivateVoiceChatRequestSchema: Schema = {
  type: 'object',
  properties: {
    user_addresses: {
      type: 'array',
      items: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$', minLength: 42, maxLength: 42 },
      minItems: 2,
      maxItems: 2
    },
    room_id: { type: 'string', pattern: '^\\S+.*$' }
  },
  required: ['user_addresses', 'room_id']
}
