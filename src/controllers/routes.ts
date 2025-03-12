import { Router } from '@well-known-components/http-server'
import { wellKnownComponents as authVerificationMiddleware } from '@dcl/platform-crypto-middleware'
import { GlobalContext } from '../types'
import { errorHandler } from './handlers/error-handler'
import { pingHandler } from './handlers/ping-handler'
import { statusHandler } from './handlers/status-handler'
import { commsSceneHandler } from './handlers/comms-scene-handler'
import { muteHandler } from './handlers/mute-handler'
import { addSceneAdminHandler, removeSceneAdminHandler, listSceneAdminsHandler } from './handlers/scene-admin-handlers'
import { getPrivateConversationsTokenHandler } from './handlers/private-conversations/get-token-handler'

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter({ components }: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()
  router.use(errorHandler)

  const auth = authVerificationMiddleware({
    fetcher: components.fetch,
    optional: false,
    metadataValidator: (metadata: Record<string, any>) => metadata.signer === 'decentraland-kernel-scene'
  })

  router.get('/ping', pingHandler)
  router.get('/status', statusHandler)

  router.post('/get-scene-adapter', commsSceneHandler)
  router.post('/mute', muteHandler)

  router.get('/scene-admin', auth, listSceneAdminsHandler)
  router.post('/scene-admin', auth, addSceneAdminHandler)
  router.delete('/scene-admin', auth, removeSceneAdminHandler)

  router.get('/private-conversations/token', auth, getPrivateConversationsTokenHandler)

  return router
}
