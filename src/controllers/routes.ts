import { Router } from '@well-known-components/http-server'
import { GlobalContext } from '../types'
import { errorHandler } from './handlers/error-handler'
import { pingHandler } from './handlers/ping-handler'
import { statusHandler } from './handlers/status-handler'
import { commsSceneHandler } from './handlers/comms-scene-handler'
import { muteHandler } from './handlers/mute-handler'
import { addSceneAdminHandler, removeSceneAdminHandler, listSceneAdminsHandler } from './handlers/scene-admin-handlers'
import { wellKnownComponents as authVerificationMiddleware } from '@dcl/platform-crypto-middleware'

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter({ components }: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()
  router.use(errorHandler)

  const auth = authVerificationMiddleware({
    fetcher: components.fetch,
    optional: false,
    metadataValidator: (metadata: Record<string, any>) => metadata.signer === 'decentraland-cooms-gatekeeper'
  })

  router.get('/ping', pingHandler)
  router.get('/status', statusHandler)

  router.post('/get-scene-adapter', commsSceneHandler)
  router.post('/mute', muteHandler)

  router.get('/scene-admin', auth, listSceneAdminsHandler)
  router.post('/scene-admin', auth, addSceneAdminHandler)
  router.delete('/scene-admin/:entityId/:admin', auth, removeSceneAdminHandler)

  return router
}
