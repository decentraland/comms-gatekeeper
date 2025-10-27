import { JSONSchemaType } from 'ajv'

export type PrivateVoiceChatRequestBody = {
  user_addresses: string[]
  room_id: string
}

export const PrivateVoiceChatRequestSchema: JSONSchemaType<PrivateVoiceChatRequestBody> = {
  type: 'object',
  properties: {
    user_addresses: {
      type: 'array',
      items: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
      minItems: 2,
      maxItems: 2
    },
    room_id: { type: 'string', minLength: 1 }
  },
  required: ['user_addresses', 'room_id']
}
