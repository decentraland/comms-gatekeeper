import { IHttpServerComponent } from '@dcl/core-commons'
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
  const { sceneId, identity, realm, parcel } = await validate(context)
  const realmName = realm.serverName
  const isLocalPreview = livekit.isLocalPreview(realmName)
  const isWorld = realmName.endsWith('.eth')
  let room: string
  const permissions: Permissions = {
    cast: [],
    mute: []
  }

  if (!isLocalPreview && !sceneId) {
    throw new InvalidRequestError('Access denied, invalid signed-fetch request, no sceneId')
  }

  // TODO: when running preview how to handle this case ?
  // Should we have a list of valid public keys ?
  const serverPublicKey = await config.getString('AUTHORITATIVE_SERVER_ADDRESS')
  if (!isLocalPreview && identity.toLocaleLowerCase() !== serverPublicKey?.toLocaleLowerCase()) {
    throw new UnauthorizedError('Access denied, invalid server public key')
  }

  let resolvedSceneId = sceneId
  if (isWorld) {
    try {
      resolvedSceneId = await worlds.fetchWorldSceneId(realmName, parcel)
    } catch (error) {
      logger.error(`Failed to fetch scene ID for world ${realmName}: ${error}`)
      throw new InvalidRequestError(`Failed to resolve scene ID for world ${realmName}`)
    }
  }

  const isDenylisted = await denyList.isDenylisted(identity)
  if (isDenylisted) {
    logger.warn(`Rejected connection from deny-listed wallet: ${identity}`)
    throw new UnauthorizedError('Access denied, deny-listed wallet')
  }

  if (isLocalPreview) {
    room = `preview-${sceneId}`
  } else if (isWorld) {
    room = livekit.getWorldSceneRoomName(realmName, resolvedSceneId)
  } else {
    room = livekit.getSceneRoomName(realmName, resolvedSceneId)
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
