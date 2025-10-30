import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'
import { CommunityVoiceChatAction } from '../../../types/community-voice'
import { CommunityRole } from '../../../types/social.type'
import { CommunityVoiceChatRequestBody } from './schemas'

export async function communityVoiceChatHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/community-voice-chat'>
) {
  const {
    components: { logs, voice }
  } = context
  const logger = logs.getLogger('community-voice-chat-handler')

  const body: CommunityVoiceChatRequestBody = await context.request.json()

  const lowerCaseUserAddress = body.user_address.toLowerCase()
  const userRole = (body.user_role || CommunityRole.None) as CommunityRole // Default to none if not provided

  // Generate credentials for the user with their role and action
  logger.debug(
    `${body.action === CommunityVoiceChatAction.CREATE ? 'Creating' : 'Joining'} community voice chat credentials for user with role: ${userRole}`
  )

  const credentials = await voice.getCommunityVoiceChatCredentialsWithRole(
    body.community_id,
    lowerCaseUserAddress,
    userRole,
    body.profile_data,
    body.action
  )

  logger.debug(
    `${body.action === CommunityVoiceChatAction.CREATE ? 'Created' : 'Joined'} community voice chat credentials for user ${lowerCaseUserAddress} with role ${userRole} in community ${body.community_id}`
  )

  return {
    status: 200,
    body: {
      connection_url: credentials.connectionUrl
    }
  }
}
