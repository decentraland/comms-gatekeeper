import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function demoteSpeakerHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/community-voice-chat/:communityId/users/:userAddress/speaker'>
) {
  const {
    components: { logs, voice },
    params
  } = context
  const logger = logs.getLogger('demote-speaker-handler')

  const { communityId, userAddress } = params

  if (!communityId) {
    throw new InvalidRequestError('The parameter communityId is required')
  }

  if (!userAddress) {
    throw new InvalidRequestError('The parameter userAddress is required')
  }

  const lowerCaseUserAddress = userAddress.toLowerCase()

  logger.info(`Demoting user ${lowerCaseUserAddress} to listener in community ${communityId}`)

  await voice.demoteSpeakerInCommunity(communityId, lowerCaseUserAddress)

  return {
    status: 200,
    body: {
      message: 'User demoted to listener successfully'
    }
  }
}
