import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function checkUserCommunityStatusHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/users/:userAddress/community-voice-chat-status'>
) {
  const {
    components: { logs, voice },
    params
  } = context
  const logger = logs.getLogger('check-user-community-status-handler')

  const { userAddress } = params

  if (!userAddress) {
    throw new InvalidRequestError('The parameter userAddress is required')
  }

  const lowerCaseUserAddress = userAddress.toLowerCase()

  logger.info(`Checking community voice chat status for user ${lowerCaseUserAddress}`)

  const isInCommunityCall = await voice.isUserInCommunityVoiceChat(lowerCaseUserAddress)

  return {
    status: 200,
    body: {
      userAddress: lowerCaseUserAddress,
      isInCommunityVoiceChat: isInCommunityCall
    }
  }
}
