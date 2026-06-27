import { HandlerContextWithPath } from '../../../types'
import { ForbiddenError, UnauthorizedError } from '../../../types/errors'
import { PrivateMessagesPrivacy } from '../../../types/social.type'
import { getRequestIp } from '../../../logic/utils'

export async function getPrivateMessagesTokenHandler(
  context: HandlerContextWithPath<
    'fetch' | 'livekit' | 'logs' | 'denyList' | 'social' | 'config' | 'userModeration' | 'playerConnectionDb',
    '/private-messages/token'
  >
) {
  const {
    components: { livekit, logs, denyList, config, social, userModeration, playerConnectionDb }
  } = context

  const identity: string | undefined = context.verification?.auth.toLowerCase()
  // Not having an identity should not ever happen
  if (!identity) {
    throw new UnauthorizedError('Access denied, invalid identity')
  }
  const logger = logs.getLogger('get-private-messages-token-handler')
  const PRIVATE_MESSAGES_ROOM_ID = await config.requireString('PRIVATE_MESSAGES_ROOM_ID')

  const deviceIdentifier: string | undefined = context.verification?.authMetadata?.deviceIdentifier
  const ipAddress = getRequestIp(context.request.headers)

  // These checks only depend on the resolved identity, so run them concurrently to save a DB
  // round-trip on the hot path. The connection-info upsert is best-effort (never blocks token
  // issuance); the deny-list and ban checks keep their current behavior. Gate precedence (deny
  // list → platform ban) is preserved below.
  const [, isDenylisted, banStatus] = await Promise.all([
    playerConnectionDb
      .upsertPlayerConnection({ address: identity, ipAddress, deviceId: deviceIdentifier })
      .catch((error) => {
        logger.warn(`Failed to store player connection info for ${identity}: ${error}`)
      }),
    denyList.isDenylisted(identity),
    userModeration.getActiveBanForConnection({ address: identity, deviceId: deviceIdentifier })
  ])

  if (isDenylisted) {
    logger.warn(`Rejected connection from deny-listed wallet: ${identity}`)
    throw new UnauthorizedError('Access denied, deny-listed wallet')
  }

  if (banStatus.isBanned) {
    logger.warn(`Rejected connection from platform-banned user: ${identity}`)
    throw new ForbiddenError('Access denied, platform-banned user')
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
