import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function createCommunityVoiceChatHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/community-voice-chat'>
) {
  const {
    components: { logs, voice }
  } = context
  const logger = logs.getLogger('create-community-voice-chat-handler')

  logger.debug('Creating community voice chat credentials for moderator')

  let body: { community_id: string; moderator_address: string }

  try {
    body = await context.request.json()
  } catch (error) {
    logger.error(`Error parsing request body: ${error}`)
    throw new InvalidRequestError('Invalid request body')
  }

  if (!body.community_id) {
    throw new InvalidRequestError('The property community_id is required')
  }

  if (!body.moderator_address) {
    throw new InvalidRequestError('The property moderator_address is required')
  }

  const lowerCaseModeratorAddress = body.moderator_address.toLowerCase()

  const credentials = await voice.getCommunityVoiceChatCredentialsForModerator(
    body.community_id,
    lowerCaseModeratorAddress
  )

  logger.debug(
    `Created community voice chat credentials for moderator ${lowerCaseModeratorAddress} in community ${body.community_id}`
  )

  return {
    status: 200,
    body: {
      connection_url: credentials.connectionUrl
    }
  }
}
