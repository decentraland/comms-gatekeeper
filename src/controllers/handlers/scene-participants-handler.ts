import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../types'
import { InvalidRequestError } from '../../types/errors'

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
 * - pointer: Scene pointer/base parcel (e.g., "-7,-2"). Optional for worlds.
 * - realm_name: Realm name. Defaults to "main" if pointer is provided without realm_name.
 *               If it ends with .eth, it's treated as a world name.
 *
 * Usage:
 * - Scene room (explicit realm): ?pointer=-7,-2&realm_name=main
 * - Scene room (default realm): ?pointer=-7,-2 (defaults to realm_name=main)
 * - World scene room: ?pointer=0,0&realm_name=mycoolworld.dcl.eth
 * - World room (all participants): ?realm_name=mycoolworld.dcl.eth
 *
 * Returns a list of wallet addresses (lowercase, 42 chars) of connected participants.
 */
export async function getSceneParticipantsHandler(
  context: HandlerContextWithPath<'sceneParticipants', '/scene-participants'>
): Promise<IHttpServerComponent.IResponse> {
  const { sceneParticipants } = context.components
  const { url } = context

  const pointer = url.searchParams.get('pointer')
  let realmName = url.searchParams.get('realm_name')

  // Retrocompatibility: if pointer is provided without realm_name, default to "main"
  if (pointer && !realmName) {
    realmName = 'main'
  }

  if (!pointer && !realmName) {
    throw new InvalidRequestError('Either pointer or realm_name must be provided')
  }

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
