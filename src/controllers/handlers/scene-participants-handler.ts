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
 * - realm_name: Realm name (default: "main" when pointer is provided).
 *               When used alone (without pointer), it's treated as a world name.
 *
 * Usage:
 * - Scene room: ?pointer=-7,-2 (uses realm_name=main by default)
 * - Scene room: ?pointer=-7,-2&realm_name=custom-realm
 * - World room: ?realm_name=mycoolworld.dcl.eth
 *
 * Returns a list of wallet addresses (lowercase, 42 chars) of connected participants.
 */
export async function getSceneParticipantsHandler(
  context: HandlerContextWithPath<'sceneParticipants', '/scene-participants'>
): Promise<IHttpServerComponent.IResponse> {
  const { sceneParticipants } = context.components
  const { url } = context

  const pointer = url.searchParams.get('pointer')
  const realmName = url.searchParams.get('realm_name') || (pointer ? 'main' : null)

  const addresses = await sceneParticipants.getParticipantAddresses({
    pointer,
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
