import { HandlerContextWithPath } from '../../../types'
import { PrivateVoiceChatRequestBody } from './schemas'

export async function createPrivateVoiceChatCredentialsHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/private-voice-chat'>
) {
  const {
    components: { logs, voice }
  } = context
  const logger = logs.getLogger('get-private-voice-chat-handler')

  logger.debug('Getting private voice chat credentials')

  const body: PrivateVoiceChatRequestBody = await context.request.json()

  const lowerCaseUserAddresses = body.user_addresses.map((address) => address.toLowerCase())

  const credentials = await voice.getPrivateVoiceChatRoomCredentials(body.room_id, lowerCaseUserAddresses)

  logger.debug(
    `Got private voice chat credentials for room ${body.room_id} with users ${lowerCaseUserAddresses.join(', ')}`
  )

  return {
    status: 200,
    body: Object.entries(credentials).reduce(
      (acc, [userAddress, { connectionUrl }]) => {
        // Re-build the object to be snake case.
        acc[userAddress] = { connection_url: connectionUrl }
        return acc
      },
      {} as Record<string, { connection_url: string }>
    )
  }
}
