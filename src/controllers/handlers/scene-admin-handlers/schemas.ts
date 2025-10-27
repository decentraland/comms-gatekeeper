import { JSONSchemaType } from 'ajv'

export type AddSceneAdminRequestBody = {
  admin?: string
  name?: string
}

export const AddSceneAdminRequestSchema: JSONSchemaType<AddSceneAdminRequestBody> = {
  type: 'object',
  oneOf: [
    {
      type: 'object',
      properties: {
        admin: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' }
      },
      required: ['admin']
    },
    {
      type: 'object',
      properties: {
        name: { type: 'string' }
      },
      required: ['name']
    }
  ]
}
