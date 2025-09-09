import { Events, UserJoinedRoomEvent } from '@dcl/schemas'
import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath, Permissions } from '../../types'
import { ForbiddenError, InvalidRequestError, NotFoundError, UnauthorizedError } from '../../types/errors'
import { oldValidate } from '../../logic/utils'

// Used to identify the preview realm for testing purposes
const PREVIEW = 'preview'

export async function commsSceneHandler(
  context: HandlerContextWithPath<
    'fetch' | 'config' | 'livekit' | 'logs' | 'blockList' | 'publisher' | 'sceneBans' | 'places',
    '/get-scene-adapter'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { livekit, logs, blockList, publisher, sceneBans }
  } = context

  const logger = logs.getLogger('comms-scene-handler')
  const { sceneId, identity, parcel, realmName } = await oldValidate(context)

  let forPreview = false
  let room: string
  const permissions: Permissions = {
    cast: [],
    mute: []
  }

  const isBlacklisted = await blockList.isBlacklisted(identity)
  if (isBlacklisted) {
    logger.warn(`Rejected connection from deny-listed wallet: ${identity}`)
    throw new UnauthorizedError('Access denied, deny-listed wallet')
  }

  const isWorld = realmName.endsWith('.eth')

  // Check if user is banned from the scene
  if (realmName !== PREVIEW) {
    try {
      const isBanned = await sceneBans.isUserBanned(identity, {
        sceneId,
        realmName,
        parcel,
        isWorld
      })

      if (isBanned) {
        logger.warn(`Rejected connection from banned user: ${identity}`, {
          sceneId: sceneId || '',
          realmName,
          parcel,
          isWorld: String(isWorld)
        })
        throw new ForbiddenError('User is banned from this scene')
      }
    } catch (error) {
      if (error instanceof ForbiddenError) {
        throw error
      }

      // Ignore other errors
      logger.warn(`Error checking if user ${identity} is banned from scene: ${error}`, {
        sceneId: sceneId || '',
        realmName,
        parcel,
        isWorld: String(isWorld)
      })
    }
  }

  if (realmName === PREVIEW) {
    room = `preview-${identity}`

    forPreview = true
  } else if (isWorld) {
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

  const credentials = await livekit.generateCredentials(identity, room, permissions, forPreview)
  logger.debug(`Token generated for ${identity} to join room ${room}`)

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
