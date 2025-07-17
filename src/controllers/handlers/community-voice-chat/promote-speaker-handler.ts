import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function promoteSpeakerHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/community-voice-chat/:communityId/users/:userAddress/speaker'>
) {
  const {
    components: { logs, voice },
    params
  } = context
  const logger = logs.getLogger('promote-speaker-handler')

  const { communityId, userAddress } = params

  if (!communityId) {
    throw new InvalidRequestError('The parameter communityId is required')
  }

  if (!userAddress) {
    throw new InvalidRequestError('The parameter userAddress is required')
  }

  const lowerCaseUserAddress = userAddress.toLowerCase()

  logger.info(`Promoting user ${lowerCaseUserAddress} to speaker in community ${communityId}`)

  await voice.promoteSpeakerInCommunity(communityId, lowerCaseUserAddress)

  return {
    status: 200,
    body: {
      message: 'User promoted to speaker successfully'
    }
  }
}
