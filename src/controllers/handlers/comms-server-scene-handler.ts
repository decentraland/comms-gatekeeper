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
  const isWorld = realmName.toLowerCase().endsWith('.eth')

  // Required on every realm, preview included: the room name is derived from it, and the
  // preview branch used to accept its absence and build a room containing `undefined`.
  if (!sceneId) {
    throw new InvalidRequestError('Access denied, invalid signed-fetch request, no sceneId')
  }

  // TODO: when running preview how to handle this case ?
  // Should we have a list of valid public keys ?
  const serverPublicKey = await config.getString('AUTHORITATIVE_SERVER_ADDRESS')
  if (!livekit.isLocalPreview(realmName) && identity.toLocaleLowerCase() !== serverPublicKey?.toLocaleLowerCase()) {
    throw new UnauthorizedError('Access denied, invalid server public key')
  }

  // No preview branch here on purpose. A preview realm name is never `.eth`, so it falls
  // through to the scene-room name below — which is what `/get-scene-adapter` mints for it.
  // Any other name lands the authoritative server in a different room than its own clients.
  if (isWorld) {
    const worldSceneId = await worlds.resolveWorldSceneId(realmName, sceneId, parcel, { allowPreviousDeployment: true })
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
