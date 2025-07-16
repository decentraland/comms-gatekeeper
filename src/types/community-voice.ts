export enum CommunityVoiceChatAction {
  CREATE = 'create',
  JOIN = 'join',
  REQUEST_TO_SPEAK = 'request-to-speak',
  PROMOTE_SPEAKER = 'promote-speaker',
  DEMOTE_SPEAKER = 'demote-speaker',
  KICK_PLAYER = 'kick-player'
}

export interface CommunityVoiceChatRequest {
  community_id: string
  user_address: string
  action: CommunityVoiceChatAction
}

export interface CommunityVoiceChatResponse {
  connection_url?: string
  message?: string
}
