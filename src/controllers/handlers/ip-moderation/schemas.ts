import type { Schema } from 'ajv'

export type BanIpRequestBody = {
  reason: string
  duration?: number
  customMessage?: string
  banAllKnownAddresses?: boolean
}

export const BanIpSchema: Schema = {
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
    },
    banAllKnownAddresses: {
      type: 'boolean'
    }
  }
}
