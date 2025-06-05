import { EthAddress } from '@dcl/schemas/dist/misc'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

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
    logger.error(`Error updating participant metadata: ${error}`)
    throw new InvalidRequestError('Invalid request body')
  }

  if (!body.address) {
    throw new InvalidRequestError('Invalid request body, missing address')
  }

  const address = body.address.toLowerCase()

  if (!EthAddress.validate(address)) {
    throw new InvalidRequestError('Invalid request body, invalid address')
  }

  await voice.endPrivateVoiceChat(id, address)

  return {
    status: 200
  }
}
