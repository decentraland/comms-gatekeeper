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
