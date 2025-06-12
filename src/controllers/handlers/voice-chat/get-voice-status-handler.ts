import { HandlerContextWithPath } from '../../../types'

export async function getVoiceChatStatusHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/users/:address/voice-chat-status'>
) {
  const {
    components: { logs, voice }
  } = context
  const { address } = context.params
  const logger = logs.getLogger('get-voice-chat-status-handler')

  const isUserInVoiceChat = await voice.isUserInVoiceChat(address)
  logger.debug(`Got that the user ${address} is ${isUserInVoiceChat ? 'in' : 'not in'} a voice chat`)

  return {
    status: 200,
    body: {
      is_user_in_voice_chat: isUserInVoiceChat
    }
  }
}
