import { JSONSchemaType } from 'ajv'
import { CommunityVoiceChatAction } from '../../../types/community-voice'
import { CommunityRole } from '../../../types/social.type'

export type CommunityVoiceChatRequestBody = {
  community_id: string
  user_address: string
  action: CommunityVoiceChatAction
  user_role?: string
  profile_data?: {
    name?: string
    has_claimed_name?: boolean
    profile_picture_url?: string
  }
}

export const CommunityVoiceChatRequestSchema: JSONSchemaType<CommunityVoiceChatRequestBody> = {
  type: 'object',
  properties: {
    community_id: { type: 'string', minLength: 1 },
    user_address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
    action: { type: 'string', enum: Object.values(CommunityVoiceChatAction) },
    user_role: { type: 'string', nullable: true, enum: Object.values(CommunityRole) },
    profile_data: {
      type: 'object',
      nullable: true,
      properties: {
        name: { type: 'string', nullable: true },
        has_claimed_name: { type: 'boolean', nullable: true },
        profile_picture_url: { type: 'string', nullable: true }
      },
      required: []
    }
  },
  required: ['community_id', 'user_address', 'action']
}

export type BulkCommunityVoiceChatStatusRequestBody = {
  community_ids: string[]
}

export const BulkCommunityVoiceChatStatusRequestSchema: JSONSchemaType<BulkCommunityVoiceChatStatusRequestBody> = {
  type: 'object',
  properties: {
    community_ids: { type: 'array', items: { type: 'string', minLength: 1 } }
  },
  required: ['community_ids']
}

export type MuteSpeakerRequestBody = {
  muted: boolean
}

export const MuteSpeakerRequestSchema: JSONSchemaType<MuteSpeakerRequestBody> = {
  type: 'object',
  properties: {
    muted: { type: 'boolean' }
  },
  required: ['muted']
}
