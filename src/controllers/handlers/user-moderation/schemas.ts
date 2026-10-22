import type { Schema } from 'ajv'

export type BanPlayerRequestBody = {
  reason: string
  duration?: number
  customMessage?: string
}

export type WarnPlayerRequestBody = {
  reason: string
}

export type RecordConnectionRequestBody = {
  deviceId?: string
  ipAddress?: string
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

// Both fields are optional: a caller may know the device but not the IP, or neither. The upsert
// COALESCEs nulls so an absent field never clobbers a previously recorded one. Lengths are
// bounded to the storage columns (device_id is TEXT, so bound it here) since the values
// ultimately originate from client-supplied metadata.
export const RecordConnectionSchema: Schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    deviceId: {
      type: 'string',
      maxLength: 128
    },
    ipAddress: {
      type: 'string',
      maxLength: 45
    }
  }
}
