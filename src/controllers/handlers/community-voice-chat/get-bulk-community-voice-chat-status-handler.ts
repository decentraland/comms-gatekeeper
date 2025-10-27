import { HandlerContextWithPath } from '../../../types'
import { BulkCommunityVoiceChatStatusRequestBody } from './schemas'

export async function getBulkCommunityVoiceChatStatusHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/community-voice-chat/status'>
) {
  const {
    components: { logs, voice },
    request
  } = context
  const logger = logs.getLogger('get-bulk-community-voice-chat-status-handler')

  const body: BulkCommunityVoiceChatStatusRequestBody = await request.json()

  const { community_ids: communityIds } = body

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
