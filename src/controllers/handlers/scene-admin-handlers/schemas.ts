import type { Schema } from 'ajv'

export type AddSceneAdminRequestBody = {
  admin?: string
  name?: string
}

export const AddSceneAdminRequestSchema: Schema = {
  type: 'object',
  properties: {
    admin: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
    name: { type: 'string' }
  },
  anyOf: [{ required: ['admin'] }, { required: ['name'] }],
  additionalProperties: false
}

export type RemoveSceneAdminRequestBody = {
  admin: string
}

export const RemoveSceneAdminRequestSchema: Schema = {
  type: 'object',
  properties: {
    admin: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' }
  },
  required: ['admin']
}
