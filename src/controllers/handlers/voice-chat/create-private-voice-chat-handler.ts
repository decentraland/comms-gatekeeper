import { EthAddress } from '@dcl/schemas/dist/misc'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function createPrivateVoiceChatCredentialsHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/private-voice-chat'>
) {
  const {
    components: { logs, voice }
  } = context
  const logger = logs.getLogger('get-private-voice-chat-handler')

  logger.debug('Getting private voice chat credentials')

  let body: { user_addresses: string[]; room_id: string }

  try {
    body = await context.request.json()
  } catch (error) {
    logger.error(`Error getting private voice chat credentials: ${error}`)
    throw new InvalidRequestError('Invalid request body')
  }

  if (!body.user_addresses || !Array.isArray(body.user_addresses)) {
    throw new InvalidRequestError('The property user_addresses is required and must be an array')
  }

  if (body.user_addresses.length !== 2) {
    throw new InvalidRequestError('The property user_addresses must have two addresses')
  }

  for (const userAddress of body.user_addresses) {
    if (!EthAddress.validate(userAddress)) {
      throw new InvalidRequestError(`Invalid address: ${userAddress}`)
    }
  }

  if (!body.room_id) {
    throw new InvalidRequestError('The property room_id is required')
  }

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
