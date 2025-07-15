import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'
import { CommunityVoiceChatAction } from '../../../types/community-voice'

export async function createCommunityVoiceChatHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/community-voice-chat'>
) {
  const {
    components: { logs, voice }
  } = context
  const logger = logs.getLogger('community-voice-chat-handler')

  let body: { 
    community_id: string; 
    user_address: string; 
    action: CommunityVoiceChatAction
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
    throw new InvalidRequestError('The property action is required and must be either "create" or "join"')
  }

  const lowerCaseUserAddress = body.user_address.toLowerCase()

  let credentials: { connectionUrl: string }

  if (body.action === CommunityVoiceChatAction.CREATE) {
    logger.debug('Creating community voice chat credentials for moderator')
    credentials = await voice.getCommunityVoiceChatCredentialsForModerator(
      body.community_id,
      lowerCaseUserAddress
    )
    logger.debug(
      `Created community voice chat credentials for moderator ${lowerCaseUserAddress} in community ${body.community_id}`
    )
  } else {
    logger.debug('Joining community voice chat as member')
    credentials = await voice.getCommunityVoiceChatCredentialsForMember(
      body.community_id, 
      lowerCaseUserAddress
    )
    logger.info(
      `Community voice chat access granted for member ${lowerCaseUserAddress} in community ${body.community_id}`
    )
  }

  return {
    status: 200,
    body: {
      connection_url: credentials.connectionUrl
    }
  }
}
