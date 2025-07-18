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
} & CommunityVoiceChatUserProfileMetadata

export type CommunityVoiceChatUserProfileMetadata = {
  name?: string
  hasClaimedName?: boolean
  profilePictureUrl?: string
}
