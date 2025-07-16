import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'
import { CommunityVoiceChatAction } from '../../../types/community-voice'

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
    throw new InvalidRequestError(
      'The property action is required and must be one of: create, join, request-to-speak, promote-speaker, demote-speaker, kick-player'
    )
  }

  const lowerCaseUserAddress = body.user_address.toLowerCase()

  try {
    switch (body.action) {
      case CommunityVoiceChatAction.CREATE: {
        logger.debug('Creating community voice chat credentials for moderator')
        const credentials = await voice.getCommunityVoiceChatCredentialsForModerator(
          body.community_id,
          lowerCaseUserAddress
        )
        logger.debug(
          `Created community voice chat credentials for moderator ${lowerCaseUserAddress} in community ${body.community_id}`
        )
        return {
          status: 200,
          body: {
            connection_url: credentials.connectionUrl
          }
        }
      }

      case CommunityVoiceChatAction.JOIN: {
        logger.debug('Joining community voice chat as member')
        const credentials = await voice.getCommunityVoiceChatCredentialsForMember(
          body.community_id,
          lowerCaseUserAddress
        )
        logger.info(
          `Community voice chat access granted for member ${lowerCaseUserAddress} in community ${body.community_id}`
        )
        return {
          status: 200,
          body: {
            connection_url: credentials.connectionUrl
          }
        }
      }

      case CommunityVoiceChatAction.REQUEST_TO_SPEAK: {
        logger.info(`User ${lowerCaseUserAddress} requesting to speak in community ${body.community_id}`)

        await voice.requestToSpeakInCommunity(body.community_id, lowerCaseUserAddress)

        return {
          status: 200,
          body: {
            message: 'Request to speak sent successfully'
          }
        }
      }

      case CommunityVoiceChatAction.PROMOTE_SPEAKER: {
        logger.info(`Promoting user ${lowerCaseUserAddress} to speaker in community ${body.community_id}`)

        await voice.promoteSpeakerInCommunity(body.community_id, lowerCaseUserAddress)

        return {
          status: 200,
          body: {
            message: 'User promoted to speaker successfully'
          }
        }
      }

      case CommunityVoiceChatAction.DEMOTE_SPEAKER: {
        logger.info(`Demoting user ${lowerCaseUserAddress} to listener in community ${body.community_id}`)

        await voice.demoteSpeakerInCommunity(body.community_id, lowerCaseUserAddress)

        return {
          status: 200,
          body: {
            message: 'User demoted to listener successfully'
          }
        }
      }

      case CommunityVoiceChatAction.KICK_PLAYER: {
        logger.info(`Kicking user ${lowerCaseUserAddress} from community ${body.community_id}`)

        await voice.kickPlayerFromCommunity(body.community_id, lowerCaseUserAddress)

        return {
          status: 200,
          body: {
            message: 'User kicked from voice chat successfully'
          }
        }
      }

      default:
        throw new InvalidRequestError(`Unknown action: ${body.action}`)
    }
  } catch (error) {
    logger.error(
      `Error handling action ${body.action} for user ${lowerCaseUserAddress} in community ${body.community_id}: ${error}`
    )

    return {
      status: 500,
      body: {
        message: 'Internal server error'
      }
    }
  }
}
