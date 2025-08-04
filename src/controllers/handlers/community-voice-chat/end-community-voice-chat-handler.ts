import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function endCommunityVoiceChatHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/community-voice-chat/:communityId/end'>
) {
  const {
    components: { logs, voice },
    params
  } = context
  const logger = logs.getLogger('end-community-voice-chat-handler')

  const { communityId } = params

  if (!communityId) {
    throw new InvalidRequestError('The parameter communityId is required')
  }

  let body: {
    user_address: string
  }

  try {
    body = await context.request.json()
  } catch (error) {
    logger.error(`Error parsing request body: ${error}`)
    throw new InvalidRequestError('Invalid request body')
  }

  if (!body.user_address) {
    throw new InvalidRequestError('The property user_address is required')
  }

  const lowerCaseUserAddress = body.user_address.toLowerCase()

  logger.info(`Ending community voice chat for community ${communityId} by user ${lowerCaseUserAddress}`)

  // Force end the community voice chat regardless of participants
  await voice.endCommunityVoiceChat(communityId, lowerCaseUserAddress)

  return {
    status: 200,
    body: {
      message: 'Community voice chat ended successfully'
    }
  }
}
