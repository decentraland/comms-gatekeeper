import { Router } from '@well-known-components/http-server'
import { bearerTokenMiddleware } from '@dcl/platform-server-commons'
import { wellKnownComponents as authVerificationMiddleware } from '@dcl/platform-crypto-middleware'
import { GlobalContext } from '../types'
import { errorHandler } from './handlers/error-handler'
import { pingHandler } from './handlers/ping-handler'
import { statusHandler } from './handlers/status-handler'
import { commsSceneHandler } from './handlers/comms-scene-handler'
import { muteHandler } from './handlers/mute-handler'
import { addSceneAdminHandler, removeSceneAdminHandler, listSceneAdminsHandler } from './handlers/scene-admin-handlers'
import { addSceneStreamAccessHandler, listSceneStreamAccessHandler } from './handlers/scene-stream-access-handlers'
import { getPrivateMessagesTokenHandler } from './handlers/private-messages/get-token-handler'
import { removeSceneStreamAccessHandler } from './handlers/scene-stream-access-handlers/remove-scene-stream-access-handler'
import { resetSceneStreamAccessHandler } from './handlers/scene-stream-access-handlers/reset-scene-stream-access-handler'
import { livekitWebhookHandler } from './handlers/livekit-webhook-handler'
import { patchUserPrivateMessagesPrivacyHandler } from './handlers/private-messages/patch-user-metadata-handler'
import { getVoiceChatStatusHandler, createPrivateVoiceChatCredentialsHandler } from './handlers/voice-chat'
import { deletePrivateVoiceChatHandler } from './handlers/voice-chat/delete-private-voice-chat.handler'
import {
  communityVoiceChatHandler,
  getCommunityVoiceChatStatusHandler,
  requestToSpeakHandler,
  rejectSpeakRequestHandler,
  promoteSpeakerHandler,
  demoteSpeakerHandler,
  kickPlayerHandler,
  endCommunityVoiceChatHandler
} from './handlers/community-voice-chat'
import { getAllActiveCommunityVoiceChatsHandler } from './handlers/get-all-active-community-voice-chats-handler'

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter({ components }: GlobalContext): Promise<Router<GlobalContext>> {
  const { config } = components

  const socialServiceInteractionsToken = await config.requireString('COMMS_GATEKEEPER_AUTH_TOKEN')
  const tokenAuthMiddleware = bearerTokenMiddleware(socialServiceInteractionsToken)

  const router = new Router<GlobalContext>()
  router.use(errorHandler)

  const auth = authVerificationMiddleware({
    fetcher: components.fetch,
    optional: false,
    metadataValidator: (metadata: Record<string, any>) => metadata.signer === 'decentraland-kernel-scene'
  })

  const authExplorer = authVerificationMiddleware({
    fetcher: components.fetch,
    optional: false,
    metadataValidator: (metadata: Record<string, any>) => metadata.signer === 'dcl:explorer'
  })

  router.get('/ping', pingHandler)
  router.get('/status', statusHandler)

  router.post('/get-scene-adapter', commsSceneHandler)
  router.post('/mute', muteHandler)

  router.get('/scene-admin', auth, listSceneAdminsHandler)
  router.post('/scene-admin', auth, addSceneAdminHandler)
  router.delete('/scene-admin', auth, removeSceneAdminHandler)

  router.get('/scene-stream-access', auth, listSceneStreamAccessHandler)
  router.post('/scene-stream-access', auth, addSceneStreamAccessHandler)
  router.delete('/scene-stream-access', auth, removeSceneStreamAccessHandler)
  router.put('/scene-stream-access', auth, resetSceneStreamAccessHandler)

  router.post('/livekit-webhook', livekitWebhookHandler)

  router.get('/private-messages/token', authExplorer, getPrivateMessagesTokenHandler)
  router.patch('/users/:address/private-messages-privacy', tokenAuthMiddleware, patchUserPrivateMessagesPrivacyHandler)

  // Private voice chat routes
  router.get('/users/:address/voice-chat-status', tokenAuthMiddleware, getVoiceChatStatusHandler)
  router.post('/private-voice-chat', tokenAuthMiddleware, createPrivateVoiceChatCredentialsHandler)
  router.delete('/private-voice-chat/:id', tokenAuthMiddleware, deletePrivateVoiceChatHandler)

  // Community voice chat routes
  router.post('/community-voice-chat', tokenAuthMiddleware, communityVoiceChatHandler)
  router.get('/community-voice-chat/:communityId/status', tokenAuthMiddleware, getCommunityVoiceChatStatusHandler)
  router.get('/community-voice-chat/active', tokenAuthMiddleware, getAllActiveCommunityVoiceChatsHandler)
  router.post(
    '/community-voice-chat/:communityId/users/:userAddress/speak-request',
    tokenAuthMiddleware,
    requestToSpeakHandler
  )
  router.delete(
    '/community-voice-chat/:communityId/users/:userAddress/speak-request',
    tokenAuthMiddleware,
    rejectSpeakRequestHandler
  )
  router.post(
    '/community-voice-chat/:communityId/users/:userAddress/speaker',
    tokenAuthMiddleware,
    promoteSpeakerHandler
  )
  router.delete(
    '/community-voice-chat/:communityId/users/:userAddress/speaker',
    tokenAuthMiddleware,
    demoteSpeakerHandler
  )
  router.delete('/community-voice-chat/:communityId/users/:userAddress', tokenAuthMiddleware, kickPlayerHandler)
  router.delete('/community-voice-chat/:communityId', tokenAuthMiddleware, endCommunityVoiceChatHandler)

  return router
}
