import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath, NotFoundError, UnauthorizedError, Permissions } from '../../types'
import { validate, fetchBlacklistedWallets } from './utils'

export async function commsSceneHandler(
  context: HandlerContextWithPath<'fetch' | 'config' | 'livekit' | 'sceneFetcher' | 'logs', '/get-scene-adapter'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { livekit, sceneFetcher, logs, config }
  } = context

  const logger = logs.getLogger('comms-scene-handler')
  const { realmName, sceneId, identity } = await validate(context)
  let forPreview = false
  let room: string
  let permissions: Permissions | undefined

  const blacklistUrl = await config.requireString('BLACKLIST_JSON_URL')

  const denyList = await fetchBlacklistedWallets(blacklistUrl)
  if (denyList.has(identity)) {
    logger.warn(`Rejected connection from deny-listed wallet: ${identity}`)
    throw new UnauthorizedError('Access denied, deny-listed wallet')
  }

  if (realmName === 'preview') {
    room = `preview-${identity}`

    forPreview = true
    permissions = {
      cast: [],
      mute: []
    }
  } else if (realmName.endsWith('.eth')) {
    permissions = await sceneFetcher.fetchWorldPermissions(realmName)
    room = livekit.getWorldRoomName(realmName)
  } else {
    if (!sceneId) {
      throw new UnauthorizedError('Access denied, invalid signed-fetch request, no sceneId')
    }
    permissions = await sceneFetcher.fetchScenePermissions(sceneId)
    room = livekit.getSceneRoomName(realmName, sceneId)
  }

  if (!permissions) {
    throw new NotFoundError('Realm or scene not found')
  }

  const credentials = await livekit.generateCredentials(identity, room, permissions, forPreview)
  logger.debug(`Token generated for ${identity} to join room ${room}`)

  return {
    status: 200,
    body: {
      adapter: `livekit:${credentials.url}?access_token=${credentials.token}`
    }
  }
}
