import type { Schema } from 'ajv'

export type AddSceneBanRequest = {
  banned_address?: string
  banned_name?: string
}

export const AddSceneBanRequestSchema: Schema = {
  type: 'object',
  oneOf: [
    {
      type: 'object',
      properties: {
        banned_address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' }
      },
      required: ['banned_address']
    },
    {
      type: 'object',
      properties: {
        banned_name: { type: 'string' }
      },
      required: ['banned_name']
    }
  ]
}
