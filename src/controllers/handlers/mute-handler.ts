import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath, InvalidRequestError, NotFoundError, UnauthorizedError, Permissions } from '../../types'
import { validate } from './utils'

export async function muteHandler(
  context: HandlerContextWithPath<'fetch' | 'config' | 'livekit' | 'sceneFetcher', '/comms-scene'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { livekit, sceneFetcher }
  } = context

  const { realmName, sceneId, identity } = await validate(context)

  let room: string
  let permissions: Permissions | undefined

  if (realmName.endsWith('.eth')) {
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

  if (!permissions.mute.includes(identity)) {
    throw new UnauthorizedError(`Not authorized to mute users in ${room}`)
  }

  const { participantId } = await context.request.json()

  if (!participantId) {
    throw new InvalidRequestError('Missing participantId')
  }

  await livekit.muteParticipant(room, participantId)

  return {
    status: 204
  }
}
