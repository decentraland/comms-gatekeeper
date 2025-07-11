import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, NotFoundError } from '../../../types/errors'

export async function getCommunityVoiceChatStatusHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/community-voice-chat/:communityId/status'>
) {
  const {
    components: { logs, voice },
    params
  } = context
  const logger = logs.getLogger('get-community-voice-chat-status-handler')

  const communityId = params.communityId

  if (!communityId) {
    throw new InvalidRequestError('The parameter communityId is required')
  }

  logger.debug(`Getting community voice chat status for community ${communityId}`)

  try {
    const status = await voice.getCommunityVoiceChatStatus(communityId)

    logger.debug(`Community voice chat status for ${communityId}: ${status.active ? 'active' : 'inactive'}`)

    return {
      status: 200,
      body: {
        active: status.active,
        participant_count: status.participantCount,
        moderator_count: status.moderatorCount
      }
    }
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('404')) {
      throw new NotFoundError(`Community voice chat not found for community ${communityId}`)
    }
    throw error
  }
}
