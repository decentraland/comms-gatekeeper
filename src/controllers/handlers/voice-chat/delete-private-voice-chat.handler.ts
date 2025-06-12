import { EthAddress } from '@dcl/schemas/dist/misc'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, NotFoundError } from '../../../types/errors'
import { RoomDoesNotExistError } from '../../../adapters/db/errors'

export async function deletePrivateVoiceChatHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/private-voice-chat/:id'>
) {
  const {
    components: { logs, voice }
  } = context
  const { id } = context.params
  const logger = logs.getLogger('delete-private-voice-chat-handler')
  logger.debug(`Deleting private voice chat ${id}`)

  let body: { address: string }

  try {
    body = await context.request.json()
  } catch (error) {
    throw new InvalidRequestError('Invalid request body')
  }

  if (!body.address) {
    throw new InvalidRequestError('Invalid request body, missing address')
  }

  const address = body.address.toLowerCase()

  if (!EthAddress.validate(address)) {
    throw new InvalidRequestError('Invalid request body, invalid address')
  }

  try {
    const usersInRoom = await voice.endPrivateVoiceChat(id, address)

    return {
      status: 200,
      body: {
        users_in_voice_chat: usersInRoom
      }
    }
  } catch (error) {
    logger.error(`Error deleting private voice chat ${id} for user ${address}: ${error}`)
    if (error instanceof RoomDoesNotExistError) {
      throw new NotFoundError(`Room ${id} does not exist`)
    }

    throw error
  }
}
