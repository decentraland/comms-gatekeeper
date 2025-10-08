import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function getBulkCommunityVoiceChatStatusHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/community-voice-chat/status'>
) {
  const {
    components: { logs, voice },
    request
  } = context
  const logger = logs.getLogger('get-bulk-community-voice-chat-status-handler')

  let body: { community_ids: string[] }

  try {
    body = await request.json()
  } catch (error) {
    throw new InvalidRequestError('The request body is required and must be a valid JSON object')
  }

  const { community_ids: communityIds } = body

  if (!Array.isArray(communityIds)) {
    throw new InvalidRequestError('The parameter community_ids must be an array')
  }

  if (communityIds.some((id) => typeof id !== 'string' || id.trim() === '')) {
    throw new InvalidRequestError('All community_ids must be non-empty strings')
  }

  logger.debug(`Getting bulk community voice chat status for ${communityIds.length} communities`)

  const statuses = await voice.getBulkCommunityVoiceChatStatus(communityIds)

  logger.debug(`Retrieved status for ${statuses.length} communities`)

  return {
    status: 200,
    body: {
      data: statuses.map((status) => ({
        community_id: status.communityId,
        active: status.active,
        participant_count: status.participantCount,
        moderator_count: status.moderatorCount
      }))
    }
  }
}
