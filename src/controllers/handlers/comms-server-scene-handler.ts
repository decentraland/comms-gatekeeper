import { Events, UserJoinedRoomEvent } from '@dcl/schemas'
import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath, Permissions } from '../../types'
import { InvalidRequestError, NotFoundError, UnauthorizedError } from '../../types/errors'
import { validate } from '../../logic/utils'

export async function commsServerSceneHandler(
  context: HandlerContextWithPath<
    'fetch' | 'config' | 'livekit' | 'logs' | 'denyList' | 'publisher',
    '/get-server-scene-adapter'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { livekit, logs, denyList, publisher, config }
  } = context

  const logger = logs.getLogger('comms-scene-handler')
  const { sceneId, identity, parcel, realm } = await validate(context)
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

  // TODO: when running preview how to handle this case ?
  // Should we have a list of valid public keys ?
  const serverPublicKey = await config.getString('AUTHORATIVE_SERVER_PUBLIC_KEY')
  if (realmName !== 'LocalPreview' && identity !== serverPublicKey) {
    throw new UnauthorizedError('Access denied, invalid server public key')
  }

  if (isWorld) {
    room = livekit.getWorldRoomName(realmName)
  } else {
    if (!sceneId) {
      throw new InvalidRequestError('Access denied, invalid signed-fetch request, no sceneId')
    }
    room = livekit.getSceneRoomName(realmName, sceneId)
  }

  if (!permissions) {
    throw new NotFoundError('Realm or scene not found')
  }

  const AUTH_SERVER_IDENTITY = 'authoritative-server'
  const credentials = await livekit.generateCredentials(AUTH_SERVER_IDENTITY, room, permissions, false)
  logger.debug(`Token generated for ${identity} as ${AUTH_SERVER_IDENTITY} to join room ${room}`)

  setImmediate(async () => {
    const event: UserJoinedRoomEvent = {
      type: Events.Type.COMMS,
      subType: Events.SubType.Comms.USER_JOINED_ROOM,
      key: `user-joined-room-${room}`,
      timestamp: Date.now(),
      metadata: {
        sceneId: sceneId || '',
        userAddress: identity.toLowerCase(),
        parcel,
        realmName,
        isWorld
      }
    }

    // TODO: do we need this for the authoritative-server peer ?
    try {
      await publisher.publishMessages([event])
      logger.debug(`Published UserJoinedRoomEvent for ${identity} in room ${room}`)
    } catch (error: any) {
      logger.error(`Failed to publish UserJoinedRoomEvent: ${error}`, {
        error,
        event: JSON.stringify(event),
        room
      })
    }
  })

  return {
    status: 200,
    body: {
      adapter: livekit.buildConnectionUrl(credentials.url, credentials.token)
    }
  }
}
