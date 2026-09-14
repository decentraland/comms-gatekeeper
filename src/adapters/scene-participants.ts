import { IBaseComponent } from '@well-known-components/interfaces'
import { AppComponents } from '../types'
import { InvalidRequestError, NotFoundError } from '../types/errors'
import { getErrorMessage } from '../logic/errors'
import { PresenceMapWarmingError } from '../logic/presence-map/warming'

export type SceneParticipantsParams = {
  pointer?: string | null
  realmName?: string | null
}

export interface ISceneParticipantsComponent extends IBaseComponent {
  getParticipantAddresses(params: SceneParticipantsParams): Promise<string[]>
}

type Target = {
  kind: 'land' | 'world'
  realmName: string
  realm: string
  pointer?: string
}

function isWorldName(name: string): boolean {
  return name.toLowerCase().endsWith('.eth')
}

/**
 * Creates the component behind `GET /scene-participants`.
 *
 * Pulse's `engine.parcel_changes` feed is the only presence source. The component answers who is
 * standing on the requested scene's parcels, or in the requested world realm, and subtracts the
 * gatekeeper's own scene ban list. Until the map has a live source it throws the shared warming
 * error rather than reporting an empty scene.
 *
 * @param components - The content client, worlds, places, scene ban manager, presence map and logs.
 * @returns The scene participants component.
 */
export async function createSceneParticipantsComponent(
  components: Pick<AppComponents, 'contentClient' | 'worlds' | 'places' | 'sceneBanManager' | 'presenceMap' | 'logs'>
): Promise<ISceneParticipantsComponent> {
  const { contentClient, worlds, places, sceneBanManager, presenceMap, logs } = components
  const logger = logs.getLogger('scene-participants')

  function resolveTarget(params: SceneParticipantsParams): Target {
    const { pointer, realmName } = params

    if (realmName && isWorldName(realmName)) {
      return {
        kind: 'world',
        realmName,
        realm: realmName.toLowerCase(),
        pointer: pointer ?? undefined
      }
    }

    if (pointer && realmName) {
      return { kind: 'land', realmName, realm: realmName.toLowerCase(), pointer }
    }

    throw new InvalidRequestError('Either pointer with realm_name or a world realm_name must be provided')
  }

  /**
   * Resolves the place the request is about so its ban list can be subtracted.
   *
   * @param target - The validated request.
   * @param worldSceneEntityId - The resolved entity id for a world-scene request.
   * @returns The lower-cased banned addresses, or an empty set when the lookup fails.
   */
  async function bannedAddresses(target: Target, worldSceneEntityId?: string): Promise<Set<string>> {
    try {
      let placeId: string

      if (target.kind === 'world' && worldSceneEntityId) {
        placeId = (await places.getWorldScenePlaceByEntityId(target.realmName, worldSceneEntityId)).id
      } else if (target.kind === 'world') {
        placeId = (await places.getWorldByName(target.realmName)).id
      } else {
        placeId = (await places.getPlaceByParcel(target.pointer!)).id
      }

      const banned = await sceneBanManager.listBannedAddresses(placeId)
      return new Set(banned.map((address) => address.toLowerCase()))
    } catch (error) {
      logger.warn(
        `Could not resolve the ban list for the ${target.kind} answer, serving it unfiltered: ${getErrorMessage(error)}`
      )
      return new Set()
    }
  }

  async function fromPresenceMap(target: Target): Promise<string[]> {
    const { realm, realmName, pointer } = target
    let addresses: string[]
    let worldSceneEntityId: string | undefined

    if (target.kind === 'world' && pointer) {
      const worldScene = await worlds.fetchWorldSceneByPointer(realmName, pointer)
      if (!worldScene) {
        throw new NotFoundError(`No scene found for world ${realmName} at pointer: ${pointer}`)
      }
      worldSceneEntityId = worldScene.entityId
      addresses = presenceMap.getAddressesInParcels(realm, worldScene.parcels ?? [])
    } else if (target.kind === 'world') {
      addresses = presenceMap.getAddressesInRealm(realm)
    } else {
      const entities = await contentClient.fetchEntitiesByPointers([pointer!])
      if (!entities || entities.length === 0) {
        throw new NotFoundError(`No scene found for pointer: ${pointer}`)
      }
      const parcels: string[] = entities[0].metadata?.scene?.parcels ?? entities[0].pointers ?? []
      addresses = presenceMap.getAddressesInParcels(realm, parcels)
    }

    const banned = await bannedAddresses(target, worldSceneEntityId)
    return banned.size === 0 ? addresses : addresses.filter((address) => !banned.has(address))
  }

  async function getParticipantAddresses(params: SceneParticipantsParams): Promise<string[]> {
    const target = resolveTarget(params)
    if (!presenceMap.isReady()) {
      logger.warn('The presence map is not primed yet; answering /scene-participants with 503 warming')
      throw new PresenceMapWarmingError()
    }
    return await fromPresenceMap(target)
  }

  return { getParticipantAddresses }
}
