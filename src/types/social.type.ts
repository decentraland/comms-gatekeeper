export type ISocialComponent = {
  getUserPrivacySettings: (identity: string) => Promise<PrivacySettings>
}

export enum PrivateMessagesPrivacy {
  ALL = 'all',
  ONLY_FRIENDS = 'only_friends'
}

export type PrivacySettings = {
  private_messages_privacy: PrivateMessagesPrivacy
}

export enum CommunityRole {
  Moderator = 'moderator',
  Member = 'member'
}

export type CommunityVoiceChatUserMetadata = {
  role: CommunityRole
  isSpeaker?: boolean
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
