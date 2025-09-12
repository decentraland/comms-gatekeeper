import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'
import { CommunityVoiceChatAction } from '../../../types/community-voice'
import { CommunityVoiceChatUserProfile } from '../../../types/social.type'
import { CommunityRole } from '../../../types/social.type'

export async function communityVoiceChatHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/community-voice-chat'>
) {
  const {
    components: { logs, voice }
  } = context
  const logger = logs.getLogger('community-voice-chat-handler')

  let body: {
    community_id: string
    user_address: string
    action: CommunityVoiceChatAction
    user_role?: string
    profile_data?: CommunityVoiceChatUserProfile
  }

  try {
    body = await context.request.json()
  } catch (error) {
    logger.error(`Error parsing request body: ${error}`)
    throw new InvalidRequestError('Invalid request body')
  }

  if (!body.community_id) {
    throw new InvalidRequestError('The property community_id is required')
  }

  if (!body.user_address) {
    throw new InvalidRequestError('The property user_address is required')
  }

  if (!body.action || !Object.values(CommunityVoiceChatAction).includes(body.action)) {
    throw new InvalidRequestError('The property action is required and must be one of: create, join')
  }

  const lowerCaseUserAddress = body.user_address.toLowerCase()
  const userRoleString = body.user_role || CommunityRole.None // Default to none if not provided

  // Validate that the role is valid
  const validRoles = Object.values(CommunityRole)
  if (!validRoles.includes(userRoleString as CommunityRole)) {
    throw new InvalidRequestError(`Invalid user_role. Must be one of: ${validRoles.join(', ')}`)
  }

  const userRole = userRoleString as CommunityRole

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
