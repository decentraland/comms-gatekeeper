import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'
import { validate } from '../../../logic/utils'

/**
 * Retrieves the list of presenters in a cast room.
 * The room is derived from the Signed Fetch auth metadata (sceneId + realm).
 *
 * @param context - HTTP request context with authentication and components
 * @returns 200 with presenter list, or error status
 */
export async function getPresentersHandler(
  context: HandlerContextWithPath<'cast' | 'fetch' | 'config' | 'livekit', '/cast/presenters'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { cast, livekit }
  } = context

  const { identity: callerAddress, sceneId, realm, isWorld } = await validate(context)

  if (!sceneId) {
    throw new InvalidRequestError('sceneId is required in authMetadata')
  }

  const roomId = isWorld
    ? livekit.getWorldSceneRoomName(realm.serverName, sceneId)
    : livekit.getSceneRoomName(realm.serverName, sceneId)

  const result = await cast.getPresenters(roomId, callerAddress)

  return { status: 200, body: result }
}
