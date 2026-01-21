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
 * - pointer: Scene pointer/base parcel (e.g., "-7,-2") - used with realm_name for scene rooms.
 *            The scene ID is fetched from the catalyst using this pointer.
 * - world_name: World name (e.g., "mycoolworld.dcl.eth") - for world rooms
 * - realm_name: Realm name - when used with pointer, identifies the realm for scene rooms.
 *               When used alone (without pointer), it's treated as a world name.
 *
 * Usage:
 * - Scene room: ?pointer=-7,-2&realm_name=main
 * - World room (explicit): ?world_name=mycoolworld.dcl.eth
 * - World room (via realm): ?realm_name=mycoolworld.dcl.eth
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
  const realmName = url.searchParams.get('realm_name')

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
