import { Router } from '@well-known-components/http-server'
import { GlobalContext } from '../types'
import { errorHandler } from './handlers/error-handler'
import { pingHandler } from './handlers/ping-handler'
import { statusHandler } from './handlers/status-handler'
import { commsSceneHandler } from './handlers/comms-scene-handler'
import { muteHandler } from './handlers/mute-handler'

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter(_globalContext: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()
  router.use(errorHandler)

  router.get('/ping', pingHandler)
  router.get('/status', statusHandler)

  router.post('/get-scene-adapter', commsSceneHandler)
  router.post('/mute', muteHandler)

  return router
}
