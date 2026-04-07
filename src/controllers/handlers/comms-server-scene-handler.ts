import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath, Permissions } from '../../types'
import { InvalidRequestError, NotFoundError, UnauthorizedError } from '../../types/errors'
import { validate } from '../../logic/utils'

export async function commsServerSceneHandler(
  context: HandlerContextWithPath<
    'fetch' | 'config' | 'livekit' | 'logs' | 'denyList' | 'worlds',
    '/get-server-scene-adapter'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { livekit, logs, denyList, config, worlds }
  } = context

  const logger = logs.getLogger('comms-scene-handler')
  const { sceneId, identity, realm } = await validate(context)
  let room: string
  const permissions: Permissions = {
    cast: [],
    mute: []
  }

  const isDenylisted = await denyList.isDenylisted(identity)
  if (isDenylisted) {
    logger.warn(`Rejected connection from deny-listed wallet: ${identity}`)
    throw new UnauthorizedError('Access denied, deny-listed wallet')
  }
  const realmName = realm.serverName
  const isWorld = realmName.endsWith('.eth')

  if (!livekit.isLocalPreview(realmName) && !sceneId) {
    throw new InvalidRequestError('Access denied, invalid signed-fetch request, no sceneId')
  }

  // TODO: when running preview how to handle this case ?
  // Should we have a list of valid public keys ?
  const serverPublicKey = await config.getString('AUTHORITATIVE_SERVER_ADDRESS')
  if (!livekit.isLocalPreview(realmName) && identity.toLocaleLowerCase() !== serverPublicKey?.toLocaleLowerCase()) {
    throw new UnauthorizedError('Access denied, invalid server public key')
  }

  if (livekit.isLocalPreview(realmName)) {
    room = `preview-${sceneId}`
  } else if (isWorld) {
    // The caller may send the world name as the sceneId instead of the content hash.
    // Resolve the real sceneId from the world's about endpoint to ensure the room name
    // matches the one used by ban/stream/cast operations.
    let worldSceneId = sceneId
    if (sceneId.endsWith('.eth')) {
      try {
        worldSceneId = await worlds.fetchWorldSceneId(realmName)
      } catch (error) {
        logger.error(`Failed to fetch scene ID for world ${realmName}: ${error}`)
        throw new InvalidRequestError(`Failed to resolve scene ID for world ${realmName}`)
      }
    }
    room = livekit.getWorldSceneRoomName(realmName, worldSceneId)
  } else {
    room = livekit.getSceneRoomName(realmName, sceneId)
  }

  if (!permissions) {
    throw new NotFoundError('Realm or scene not found')
  }

  const AUTH_SERVER_IDENTITY = 'authoritative-server'
  const credentials = await livekit.generateCredentials(AUTH_SERVER_IDENTITY, room, permissions, false)
  logger.debug(`Token generated for ${identity} as ${AUTH_SERVER_IDENTITY} to join room ${room}`)

  return {
    status: 200,
    body: {
      adapter: livekit.buildConnectionUrl(credentials.url, credentials.token)
    }
  }
}
