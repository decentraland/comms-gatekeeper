import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function rejectSpeakRequestHandler(
  context: HandlerContextWithPath<
    'logs' | 'voice',
    '/community-voice-chat/:communityId/users/:userAddress/speak-request'
  >
) {
  const {
    components: { logs, voice },
    params
  } = context
  const logger = logs.getLogger('reject-speak-request-handler')

  const { communityId, userAddress } = params

  if (!communityId) {
    throw new InvalidRequestError('The parameter communityId is required')
  }

  if (!userAddress) {
    throw new InvalidRequestError('The parameter userAddress is required')
  }

  const lowerCaseUserAddress = userAddress.toLowerCase()

  logger.info(`Rejecting speak request for user ${lowerCaseUserAddress} in community ${communityId}`)

  await voice.rejectSpeakRequestInCommunity(communityId, lowerCaseUserAddress)

  return {
    status: 200,
    body: {
      message: 'Speak request rejected successfully'
    }
  }
}
