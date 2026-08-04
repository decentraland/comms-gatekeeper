import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'
import { resolveCastRoom } from './room-resolver'

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

  const { roomId } = await resolveCastRoom(
    { livekit, worlds },
    { sceneId, parcel, realmName: realm.serverName, isWorld }
  )

  const result = await cast.getPresenters(roomId, callerAddress)

  return { status: 200, body: result }
}
