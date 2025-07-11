import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function joinCommunityVoiceChatHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/community-voice-chat/join'>
) {
  const {
    components: { logs, voice }
  } = context
  const logger = logs.getLogger('join-community-voice-chat-handler')

  let body: { community_id: string; member_address: string }

  try {
    body = await context.request.json()
  } catch (error) {
    logger.error(`Failed to parse request body as JSON: ${error}`)
    throw new InvalidRequestError('Invalid request body - must be valid JSON')
  }

  if (!body.community_id) {
    logger.warn('Request rejected: missing community_id')
    throw new InvalidRequestError('The property community_id is required')
  }

  if (!body.member_address) {
    logger.warn('Request rejected: missing member_address')
    throw new InvalidRequestError('The property member_address is required')
  }

  const lowerCaseMemberAddress = body.member_address.toLowerCase()

  const credentials = await voice.getCommunityVoiceChatCredentialsForMember(body.community_id, lowerCaseMemberAddress)

  logger.info(
    `Community voice chat access granted for member ${lowerCaseMemberAddress} in community ${body.community_id}`
  )

  return {
    status: 200,
    body: {
      connection_url: credentials.connectionUrl
    }
  }
}
