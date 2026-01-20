import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../types'

export type SceneParticipantsResponse = {
  ok: boolean
  data: {
    addresses: string[]
  }
}

/**
 * Handler to get the list of participant addresses in a scene or world room.
 *
 * Query parameters:
 * - pointer: Scene pointer/base parcel (e.g., "10,20") - used with realm_name for scene rooms.
 *            The scene ID is fetched from the catalyst using this pointer.
 * - world_name: World name (e.g., "mycoolworld.dcl.eth") - for world rooms
 * - realm_name: Realm name (default: "main") - used with pointer for scene rooms
 *
 * Returns a list of wallet addresses (lowercase, 42 chars) of connected participants.
 */
export async function getSceneParticipantsHandler(
  context: HandlerContextWithPath<'sceneParticipants', '/scene-participants'>
): Promise<IHttpServerComponent.IResponse> {
  const { sceneParticipants } = context.components
  const { url } = context

  const pointer = url.searchParams.get('pointer')
  const worldName = url.searchParams.get('world_name')
  const realmName = url.searchParams.get('realm_name') || 'main'

  const addresses = await sceneParticipants.getParticipantAddresses({
    pointer,
    worldName,
    realmName
  })

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        addresses
      }
    }
  }
}
