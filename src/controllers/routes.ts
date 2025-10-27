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
import {
  addSceneBanHandler,
  removeSceneBanHandler,
  listSceneBansHandler,
  listSceneBansAddressesHandler
} from './handlers/scene-ban-handlers'
import { addSceneStreamAccessHandler, listSceneStreamAccessHandler } from './handlers/scene-stream-access-handlers'
import { getPrivateMessagesTokenHandler } from './handlers/private-messages/get-token-handler'
import { removeSceneStreamAccessHandler } from './handlers/scene-stream-access-handlers/remove-scene-stream-access-handler'
import { resetSceneStreamAccessHandler } from './handlers/scene-stream-access-handlers/reset-scene-stream-access-handler'
import { livekitWebhookHandler } from './handlers/livekit-webhook-handler'
import { patchUserPrivateMessagesPrivacyHandler } from './handlers/private-messages/patch-user-metadata-handler'
import {
  getVoiceChatStatusHandler,
  createPrivateVoiceChatCredentialsHandler,
  checkUserCommunityStatusHandler
} from './handlers/voice-chat'
import { deletePrivateVoiceChatHandler } from './handlers/voice-chat/delete-private-voice-chat.handler'
import {
  communityVoiceChatHandler,
  getCommunityVoiceChatStatusHandler,
  getBulkCommunityVoiceChatStatusHandler,
  requestToSpeakHandler,
  rejectSpeakRequestHandler,
  promoteSpeakerHandler,
  demoteSpeakerHandler,
  kickPlayerHandler,
  muteSpeakerHandler,
  endCommunityVoiceChatHandler
} from './handlers/community-voice-chat'
import { getAllActiveCommunityVoiceChatsHandler } from './handlers/get-all-active-community-voice-chats-handler'
import { commsServerSceneHandler } from './handlers/comms-server-scene-handler'
import { streamerTokenHandler, watcherTokenHandler, generateStreamLinkHandler } from './handlers/cast'
import { getStreamInfoHandler } from './handlers/cast/get-stream-info-handler'
import { AddSceneBanRequestSchema } from './handlers/scene-ban-handlers/schemas'
import { AddSceneAdminRequestBodySchema } from './handlers/scene-admin-handlers/schemas'
import { PrivateVoiceChatRequestSchema } from './handlers/voice-chat/schemas'
import {
  CommunityVoiceChatRequestSchema,
  BulkCommunityVoiceChatStatusRequestSchema,
  MuteSpeakerRequestSchema
} from './handlers/community-voice-chat/schemas'
import { StreamerTokenRequestSchema, WatcherTokenRequestSchema } from './handlers/cast/schemas'

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter({ components }: GlobalContext): Promise<Router<GlobalContext>> {
  const { config, validator } = components

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
  router.post('/get-server-scene-adapter', commsServerSceneHandler)

  router.post('/mute', muteHandler)

  // Scene admin routes
  router.get('/scene-admin', auth, listSceneAdminsHandler)
  router.post(
    '/scene-admin',
    auth,
    validator.withSchemaValidatorMiddleware(AddSceneAdminRequestBodySchema),
    addSceneAdminHandler
  )
  router.delete('/scene-admin', auth, removeSceneAdminHandler)

  // Scene ban routes
  router.get('/scene-bans', auth, listSceneBansHandler)
  router.get('/scene-bans/addresses', auth, listSceneBansAddressesHandler)
  router.post(
    '/scene-bans',
    auth,
    validator.withSchemaValidatorMiddleware(AddSceneBanRequestSchema),
    addSceneBanHandler
  )
  router.delete('/scene-bans', auth, removeSceneBanHandler)

  // Scene stream access routes
  router.get('/scene-stream-access', auth, listSceneStreamAccessHandler)
  router.post('/scene-stream-access', auth, addSceneStreamAccessHandler)
  router.delete('/scene-stream-access', auth, removeSceneStreamAccessHandler)
  router.put('/scene-stream-access', auth, resetSceneStreamAccessHandler)

  // Livekit webhook routes
  router.post('/livekit-webhook', livekitWebhookHandler)

  // Private messages routes
  router.get('/private-messages/token', authExplorer, getPrivateMessagesTokenHandler)
  router.patch('/users/:address/private-messages-privacy', tokenAuthMiddleware, patchUserPrivateMessagesPrivacyHandler)

  // Private voice chat routes
  router.get('/users/:address/voice-chat-status', tokenAuthMiddleware, getVoiceChatStatusHandler)
  router.post(
    '/private-voice-chat',
    tokenAuthMiddleware,
    validator.withSchemaValidatorMiddleware(PrivateVoiceChatRequestSchema),
    createPrivateVoiceChatCredentialsHandler
  )
  router.delete('/private-voice-chat/:id', tokenAuthMiddleware, deletePrivateVoiceChatHandler)

  // Community voice chat routes
  router.get('/users/:userAddress/community-voice-chat-status', tokenAuthMiddleware, checkUserCommunityStatusHandler)
  router.post(
    '/community-voice-chat',
    tokenAuthMiddleware,
    validator.withSchemaValidatorMiddleware(CommunityVoiceChatRequestSchema),
    communityVoiceChatHandler
  )
  router.get('/community-voice-chat/:communityId/status', tokenAuthMiddleware, getCommunityVoiceChatStatusHandler)
  router.post(
    '/community-voice-chat/status',
    tokenAuthMiddleware,
    validator.withSchemaValidatorMiddleware(BulkCommunityVoiceChatStatusRequestSchema),
    getBulkCommunityVoiceChatStatusHandler
  )
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
  router.patch(
    '/community-voice-chat/:communityId/users/:userAddress/mute',
    tokenAuthMiddleware,
    validator.withSchemaValidatorMiddleware(MuteSpeakerRequestSchema),
    muteSpeakerHandler
  )
  router.delete('/community-voice-chat/:communityId', tokenAuthMiddleware, endCommunityVoiceChatHandler)

  // Cast 2.0 endpoints
  router.post(
    '/cast/streamer-token',
    validator.withSchemaValidatorMiddleware(StreamerTokenRequestSchema),
    streamerTokenHandler
  )
  router.post(
    '/cast/watcher-token',
    validator.withSchemaValidatorMiddleware(WatcherTokenRequestSchema),
    watcherTokenHandler
  )
  router.get('/cast/generate-stream-link', auth, generateStreamLinkHandler)
  router.get('/cast/stream-info/:streamingKey', getStreamInfoHandler)
  return router
}
