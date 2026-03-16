import type { Schema } from 'ajv'

export type BanPlayerRequestBody = {
  reason: string
  duration?: number
  customMessage?: string
}

export type WarnPlayerRequestBody = {
  reason: string
}

export const BanPlayerSchema: Schema = {
  type: 'object',
  required: ['reason'],
  additionalProperties: false,
  properties: {
    reason: {
      type: 'string',
      minLength: 1
    },
    duration: {
      type: 'number',
      exclusiveMinimum: 0
    },
    customMessage: {
      type: 'string'
    }
  }
}

export const WarnPlayerSchema: Schema = {
  type: 'object',
  required: ['reason'],
  additionalProperties: false,
  properties: {
    reason: {
      type: 'string',
      minLength: 1
    }
  }
}
