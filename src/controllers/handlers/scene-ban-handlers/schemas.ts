import type { Schema } from 'ajv'

export type AddSceneBanRequest = {
  banned_address?: string
  banned_name?: string
}

export const AddSceneBanRequestSchema: Schema = {
  type: 'object',
  properties: {
    banned_address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
    banned_name: { type: 'string' }
  },
  anyOf: [{ required: ['banned_address'] }, { required: ['banned_name'] }],
  additionalProperties: false
}
