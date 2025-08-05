import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../types'

export async function getAllActiveCommunityVoiceChatsHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/community-voice-chat/active'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, voice }
  } = context

  const logger = logs.getLogger('get-all-active-community-voice-chats-handler')

  try {
    logger.debug('Getting all active community voice chats')

    const activeChats = await voice.getAllActiveCommunityVoiceChats()

    logger.info(`Retrieved ${activeChats.length} active community voice chats`)

    return {
      status: 200,
      body: {
        data: activeChats,
        total: activeChats.length
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Failed to get active community voice chats: ${errorMessage}`)

    return {
      status: 500,
      body: {
        error: 'Failed to get active community voice chats',
        message: errorMessage
      }
    }
  }
}
