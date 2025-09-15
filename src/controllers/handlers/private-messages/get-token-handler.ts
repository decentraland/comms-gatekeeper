import { HandlerContextWithPath } from '../../../types'
import { UnauthorizedError } from '../../../types/errors'
import { PrivateMessagesPrivacy } from '../../../types/social.type'

export async function getPrivateMessagesTokenHandler(
  context: HandlerContextWithPath<
    'fetch' | 'livekit' | 'logs' | 'denyList' | 'social' | 'config',
    '/private-messages/token'
  >
) {
  const {
    components: { livekit, logs, denyList, config, social }
  } = context

  const identity: string | undefined = context.verification?.auth.toLowerCase()
  // Not having an identity should not ever happen
  if (!identity) {
    throw new UnauthorizedError('Access denied, invalid identity')
  }
  const logger = logs.getLogger('get-private-messages-token-handler')
  const PRIVATE_MESSAGES_ROOM_ID = await config.requireString('PRIVATE_MESSAGES_ROOM_ID')

  const isDenylisted = await denyList.isDenylisted(identity)
  if (isDenylisted) {
    logger.warn(`Rejected connection from deny-listed wallet: ${identity}`)
    throw new UnauthorizedError('Access denied, deny-listed wallet')
  }

  let userPrivacySettings: { private_messages_privacy: string }
  try {
    userPrivacySettings = await social.getUserPrivacySettings(identity)
  } catch (error) {
    logger.error(`Error getting user privacy settings: ${error}`)
    // If we fail to get the user privacy settings, we default to all.
    // We don't want to block the user from accessing the private messages
    userPrivacySettings = { private_messages_privacy: PrivateMessagesPrivacy.ALL }
  }

  const credentials = await livekit.generateCredentials(
    identity,
    PRIVATE_MESSAGES_ROOM_ID,
    {
      cast: [],
      canPublish: false,
      canUpdateOwnMetadata: false
    },
    false,
    {
      private_messages_privacy: userPrivacySettings.private_messages_privacy
    }
  )

  return {
    status: 200,
    body: {
      adapter: `livekit:${credentials.url}?access_token=${credentials.token}`
    }
  }
}
