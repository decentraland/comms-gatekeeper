import { EthAddress } from '@dcl/schemas'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'
import { PrivateMessagesPrivacy } from '../../../types/social.type'
import { isErrorWithMessage } from '../../../logic/errors'

export async function patchUserPrivateMessagesPrivacyHandler(
  context: HandlerContextWithPath<'livekit' | 'logs' | 'config', '/users/:address/private-messages-privacy'>
) {
  const {
    components: { livekit, logs, config }
  } = context

  const PRIVATE_MESSAGES_ROOM_ID = await config.requireString('PRIVATE_MESSAGES_ROOM_ID')
  const logger = logs.getLogger('patch-user-private-message-metadata-handler')

  let body: {
    private_messages_privacy: string
  }
  const address = context.params.address.toLowerCase()

  if (!EthAddress.validate(address)) {
    throw new InvalidRequestError('Invalid address')
  }

  // Parse the request body, throw an error if it's not a valid JSON
  try {
    body = await context.request.json()
  } catch (error) {
    logger.error(`Error updating participant metadata: ${error}`)
    throw new InvalidRequestError('Invalid request body')
  }

  // Validate the private_messages_privacy field
  if (
    body.private_messages_privacy?.toLowerCase() !== PrivateMessagesPrivacy.ALL &&
    body.private_messages_privacy?.toLowerCase() !== PrivateMessagesPrivacy.ONLY_FRIENDS
  ) {
    throw new InvalidRequestError('Invalid private_messages_privacy')
  }

  try {
    await livekit.updateParticipantMetadata(PRIVATE_MESSAGES_ROOM_ID, address, {
      private_messages_privacy: body.private_messages_privacy
    })

    return {
      status: 204
    }
  } catch (error) {
    const errorMessage = isErrorWithMessage(error) ? error.message : 'Error updating participant metadata'
    logger.error(`Error updating participant metadata: ${errorMessage}`)

    if (errorMessage.includes('participant does not exist')) {
      throw new InvalidRequestError('Participant is not connected to the room')
    }

    throw error
  }
}
