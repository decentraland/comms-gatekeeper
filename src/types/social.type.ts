export type ISocialComponent = {
  getUserPrivacySettings: (identity: string) => Promise<PrivacySettings>
  isPlayerBanned: (address: string) => Promise<boolean>
}

export enum PrivateMessagesPrivacy {
  ALL = 'all',
  ONLY_FRIENDS = 'only_friends'
}

export type PrivacySettings = {
  private_messages_privacy: PrivateMessagesPrivacy
}

export type PlayerBanResponse = {
  isBanned: boolean
}

export enum CommunityRole {
  Owner = 'owner',
  Moderator = 'moderator',
  Member = 'member',
  None = 'none'
}

export type CommunityVoiceChatUserMetadata = {
  role: CommunityRole
  isSpeaker?: boolean
  muted?: boolean
} & CommunityVoiceChatUserProfileMetadata

export type CommunityVoiceChatUserProfile = {
  name?: string
  has_claimed_name?: boolean
  profile_picture_url?: string
}

export type CommunityVoiceChatUserProfileMetadata = {
  name?: string
  hasClaimedName?: boolean
  profilePictureUrl?: string
}
