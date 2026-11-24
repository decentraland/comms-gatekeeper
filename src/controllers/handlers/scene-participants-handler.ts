import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../types'
import { InvalidRequestError } from '../../types/errors'

export type SceneParticipantsResponse = {
  ok: boolean
  data: {
    addresses: string[]
    sceneId?: string
  }
}

/**
 * Handler to get the list of participant addresses in a scene or world room.
 *
 * Query parameters:
 * - pointer: Scene pointer/base parcel (e.g., "-7,-2"). Optional for worlds.
 * - scene_id: Exact scene entity ID. Requires realm_name and cannot be combined with pointer.
 * - realm_name: Realm name. Defaults to "main" if pointer is provided without realm_name.
 *               If it ends with .eth, it's treated as a world name.
 *
 * Usage:
 * - Scene room (explicit realm): ?pointer=-7,-2&realm_name=main
 * - Scene room (default realm): ?pointer=-7,-2 (defaults to realm_name=main)
 * - World scene room: ?pointer=0,0&realm_name=mycoolworld.dcl.eth
 * - World room (all participants): ?realm_name=mycoolworld.dcl.eth
 *
 * @param context - Request context with room query parameters and the participants component.
 * @returns Wallet addresses of connected participants, with the scene ID echoed for exact room lookups.
 * @throws An invalid request error when the room query is ambiguous or incomplete.
 */
export async function getSceneParticipantsHandler(
  context: HandlerContextWithPath<'sceneParticipants', '/scene-participants'>
): Promise<IHttpServerComponent.IResponse> {
  const { sceneParticipants } = context.components
  const { url } = context

  const pointer = url.searchParams.get('pointer')
  const sceneId = url.searchParams.get('scene_id')
  let realmName = url.searchParams.get('realm_name')

  if (sceneId !== null && (!realmName || pointer !== null || !/^[a-zA-Z0-9]{1,128}$/.test(sceneId))) {
    throw new InvalidRequestError('A valid scene_id requires realm_name without pointer')
  }

  // Retrocompatibility: if pointer is provided without realm_name, default to "main"
  if (pointer && !realmName) {
    realmName = 'main'
  }

  if (!pointer && !realmName) {
    throw new InvalidRequestError('Either pointer or realm_name must be provided')
  }

  const addresses = await sceneParticipants.getParticipantAddresses({
    pointer,
    realmName,
    ...(sceneId ? { sceneId } : {})
  })

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        addresses,
        ...(sceneId ? { sceneId } : {})
      }
    }
  }
}
