import { HandlerContextWithPath, UnauthorizedError } from '../../../types'

export async function getPrivateConversationsTokenHandler(
  context: HandlerContextWithPath<'fetch' | 'livekit' | 'logs' | 'blockList' | 'config', '/private-conversations/token'>
) {
  const {
    components: { livekit, logs, blockList, config }
  } = context
  const identity: string = context.verification?.auth.toLowerCase() ?? '0x0000000000000000000000000000000000000000'
  const logger = logs.getLogger('get-private-conversations-token-handler')
  const PRIVATE_CONVERSATIONS_ROOM_ID = await config.requireString('PRIVATE_CONVERSATIONS_ROOM_ID')

  const isBlacklisted = await blockList.isBlacklisted(identity)
  if (isBlacklisted) {
    logger.warn(`Rejected connection from deny-listed wallet: ${identity}`)
    throw new UnauthorizedError('Access denied, deny-listed wallet')
  }

  const credentials = await livekit.generateCredentials(
    identity,
    PRIVATE_CONVERSATIONS_ROOM_ID,
    {
      cast: [],
      canPublish: false,
      canSubscribe: false,
      canUpdateOwnMetadata: false
    },
    false
  )

  return {
    status: 200,
    body: {
      adapter: `livekit:${credentials.url}?access_token=${credentials.token}`
    }
  }
}
