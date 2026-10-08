import { IHttpServerComponent } from '@dcl/core-commons'
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
  context: HandlerContextWithPath<'cast' | 'fetch' | 'config' | 'livekit' | 'worlds', '/cast/presenters'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { cast, livekit, worlds }
  } = context

  const { identity: callerAddress, sceneId, parcel, realm, isWorld } = await validate(context)

  if (!sceneId) {
    throw new InvalidRequestError('sceneId is required in authMetadata')
  }

  // Content IDs identify an existing room whose stored place controls authorization.
  // Only legacy world-name IDs need a parcel lookup to select a scene.
  const resolvedSceneId =
    isWorld && sceneId.toLowerCase().endsWith('.eth')
      ? await worlds.resolveWorldSceneId(realm.serverName, sceneId, parcel)
      : sceneId
  const roomId = isWorld
    ? livekit.getWorldSceneRoomName(realm.serverName, resolvedSceneId)
    : livekit.getSceneRoomName(realm.serverName, sceneId)

  const result = await cast.getPresenters(roomId, callerAddress)

  return { status: 200, body: result }
}
