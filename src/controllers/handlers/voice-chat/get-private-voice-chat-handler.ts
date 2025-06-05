import { EthAddress } from '@dcl/schemas/dist/misc'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function getPrivateVoiceChatCredentialsHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/private-voice-chat'>
) {
  const {
    components: { logs, voice }
  } = context
  const logger = logs.getLogger('get-private-voice-chat-handler')

  logger.debug('Getting private voice chat credentials')

  let body: { userAddresses: string[]; roomId: string }

  try {
    body = await context.request.json()
  } catch (error) {
    logger.error(`Error getting private voice chat credentials: ${error}`)
    throw new InvalidRequestError('Invalid request body')
  }

  if (!body.userAddresses || !Array.isArray(body.userAddresses)) {
    throw new InvalidRequestError('The property userAddresses is required and must be an array')
  }

  if (body.userAddresses.length !== 2) {
    throw new InvalidRequestError('The property userAddresses must have two addresses')
  }

  for (const userAddress of body.userAddresses) {
    if (!EthAddress.validate(userAddress)) {
      throw new InvalidRequestError(`Invalid address: ${userAddress}`)
    }
  }

  if (!body.roomId) {
    throw new InvalidRequestError('The property roomId is required')
  }

  const lowerCaseUserAddresses = body.userAddresses.map((address) => address.toLowerCase())

  const credentials = await voice.getPrivateVoiceChatRoomCredentials(body.roomId, lowerCaseUserAddresses)

  logger.debug(
    `Got private voice chat credentials for room ${body.roomId} with users ${lowerCaseUserAddresses.join(', ')}`
  )

  return {
    status: 200,
    body: credentials
  }
}
