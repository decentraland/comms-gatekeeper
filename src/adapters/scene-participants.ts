import { IBaseComponent } from '@well-known-components/interfaces'
import { EthAddress } from '@dcl/schemas'
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

/**
 * What the request asks about, once the query parameters have been validated.
 *
 * `realmName` keeps the caller's spelling because LiveKit room names are built from it, while
 * `realm` is the canonical (lower-cased) form the presence map is keyed by. `kind` is also the
 * `presence_shadow_diff` label.
 */
type Target = {
  kind: 'land' | 'world'
  realmName: string
  realm: string
  pointer?: string
}

function isWorldName(name: string): boolean {
  return name.endsWith('.eth')
}

/**
 * How many addresses one list has that the other does not, in either direction.
 *
 * @param a - One answer.
 * @param b - The other answer.
 * @returns The size of the symmetric difference.
 */
function symmetricDifferenceSize(a: string[], b: string[]): number {
  const left = new Set(a)
  const right = new Set(b)
  let size = 0
  for (const address of left) {
    if (!right.has(address)) {
      size++
    }
  }
  for (const address of right) {
    if (!left.has(address)) {
      size++
    }
  }
  return size
}

/**
 * Creates the component behind `GET /scene-participants`.
 *
 * It carries two implementations of the same question — who is in this scene:
 *
 * - **LiveKit** (`listParticipants` on the scene's room) is what this service has always served
 *   and is still the default. It answers "who is connected to the scene's comms room".
 * - **The presence map** (Pulse's `engine.parcel_changes`) answers "who is standing on the
 *   scene's parcels", which is the question the callers actually ask, and it holds for realms
 *   this service mints no rooms for. It is contract C3 of iteration 2.
 *
 * `LIVEKIT_PRESENCE_FALLBACK` selects the served answer and defaults to `true`, i.e. to today's
 * behaviour; it is deleted at the end of the rollout. With the flag on, a cold map is harmless
 * because LiveKit is answering; with it off, a cold map answers `503 warming` rather than falling
 * back to the implementation the operator switched off. `SHADOW_COMPARE_PRESENCE` runs the other
 * implementation as well and counts how far apart the two are, so the cutover is made on measured
 * agreement rather than on hope. Only counts are recorded — never addresses.
 *
 * @param components - The config, livekit, content client, worlds, places, scene ban manager,
 * presence map, metrics and logs components.
 * @returns The scene participants component.
 */
export async function createSceneParticipantsComponent(
  components: Pick<
    AppComponents,
    | 'config'
    | 'livekit'
    | 'contentClient'
    | 'worlds'
    | 'places'
    | 'sceneBanManager'
    | 'presenceMap'
    | 'metrics'
    | 'logs'
  >
): Promise<ISceneParticipantsComponent> {
  const { config, livekit, contentClient, worlds, places, sceneBanManager, presenceMap, metrics, logs } = components
  const logger = logs.getLogger('scene-participants')

  const [livekitFallbackFlag, shadowCompareFlag] = await Promise.all([
    config.getString('LIVEKIT_PRESENCE_FALLBACK'),
    config.getString('SHADOW_COMPARE_PRESENCE')
  ])

  // Opt-out rather than opt-in: an unset flag must behave exactly like this service does today,
  // and only an explicit 'false' hands the route over to the presence map.
  const livekitFallback = livekitFallbackFlag !== 'false'
  const shadowCompare = shadowCompareFlag === 'true'

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

  async function fromLivekit(target: Target): Promise<string[]> {
    const { realmName, pointer } = target

    let roomName: string

    if (target.kind === 'world' && pointer) {
      // World scene room: fetch the scene ID from the world content server
      const worldScene = await worlds.fetchWorldSceneByPointer(realmName, pointer)

      if (!worldScene) {
        throw new NotFoundError(`No scene found for world ${realmName} at pointer: ${pointer}`)
      }

      const sceneId = worldScene.entityId
      logger.debug(`Resolved world ${realmName} pointer ${pointer} to sceneId ${sceneId}`)

      roomName = livekit.getWorldSceneRoomName(realmName, sceneId)
    } else if (target.kind === 'world') {
      // World room (no pointer): get all participants in the world
      logger.debug(`Getting participants for world room: ${realmName}`)
      roomName = livekit.getWorldRoomName(realmName)
    } else {
      // Regular scene room: fetch the scene ID from the catalyst
      const entities = await contentClient.fetchEntitiesByPointers([pointer!])

      if (!entities || entities.length === 0) {
        throw new NotFoundError(`No scene found for pointer: ${pointer}`)
      }

      const sceneId = entities[0].id
      logger.debug(`Resolved pointer ${pointer} to sceneId ${sceneId}`)

      roomName = livekit.getSceneRoomName(realmName, sceneId)
    }

    logger.debug(`Fetching participants for room: ${roomName}`)

    const roomInfo = await livekit.getRoomInfo(roomName)

    if (!roomInfo) {
      return []
    }

    const participants = await livekit.listRoomParticipants(roomName)

    // Extract wallet addresses from participant identities (lowercase, first 42 chars)
    // Filter only valid Ethereum addresses
    const addresses = participants
      .map((p) => p.identity.toLowerCase().slice(0, 42))
      .filter((address) => EthAddress.validate(address))

    logger.debug(`Found ${addresses.length} valid participants in room ${roomName}`)

    return addresses
  }

  /**
   * Resolves the place the request is about, so its ban list can be subtracted.
   *
   * @param target - The validated request.
   * @returns The banned addresses, lower-cased, or an empty list when the place cannot be
   * resolved — the answer is served unfiltered rather than not at all, which is what the LiveKit
   * implementation does today.
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
      // No pointer: the whole world. Worlds are one comms space, so every peer in the realm is
      // in it regardless of which of its parcels they stand on.
      addresses = presenceMap.getAddressesInRealm(realm)
    } else {
      const entities = await contentClient.fetchEntitiesByPointers([pointer!])

      if (!entities || entities.length === 0) {
        throw new NotFoundError(`No scene found for pointer: ${pointer}`)
      }

      // `pointers` is the deployment's own list and is what the entity is indexed by; the
      // metadata copy is preferred because it is what the scene declares about itself, and it is
      // the list /hot-scenes counts over.
      const parcels: string[] = entities[0].metadata?.scene?.parcels ?? entities[0].pointers ?? []
      addresses = presenceMap.getAddressesInParcels(realm, parcels)
    }

    // Always, per C3: a ban takes effect here immediately, closing the window (up to 30 s) before
    // Pulse's BanEnforcer evicts the wallet and it disappears from the feed on its own.
    const banned = await bannedAddresses(target, worldSceneEntityId)
    if (banned.size === 0) {
      return addresses
    }

    return addresses.filter((address) => !banned.has(address))
  }

  /**
   * Counts how far the two implementations disagree, under the `kind` of the request.
   *
   * Counts only: the addresses themselves never reach a log line or a label, both because a
   * metric label per wallet would be unbounded cardinality and because who is standing where is
   * not something to scatter across telemetry.
   */
  async function compareInShadow(target: Target, served: string[], shadow: () => Promise<string[]>): Promise<void> {
    try {
      const other = await shadow()
      const difference = symmetricDifferenceSize(served, other)

      if (difference > 0) {
        metrics.increment('presence_shadow_diff', { kind: target.kind }, difference)
        logger.info(
          `Presence sources disagree on a ${target.kind} request: ${difference} of ${
            served.length + other.length
          } addresses`
        )
      }
    } catch (error) {
      // The comparison is observability, never part of the answer.
      logger.warn(`Shadow presence comparison failed for a ${target.kind} request: ${getErrorMessage(error)}`)
    }
  }

  async function getParticipantAddresses(params: SceneParticipantsParams): Promise<string[]> {
    const target = resolveTarget(params)

    // The map answers only once it holds a usable view of the world.
    //
    // While `LIVEKIT_PRESENCE_FALLBACK` is on, LiveKit is the served answer anyway, so a cold map
    // costs nothing — that is the accepted cold-map fallback, and it is what every deploy does
    // until the flag is turned off. Once it is off, the operator has said LiveKit must not answer
    // for this route, so a cold map has nothing to serve: it reports itself as warming, exactly
    // as /hot-scenes does. An empty list would read as "this scene is deserted", which is a wrong
    // answer rather than a missing one.
    const mapIsUsable = presenceMap.isReady()
    if (!livekitFallback && !mapIsUsable) {
      logger.warn('The presence map is not primed yet; answering /scene-participants with 503 warming')
      throw new PresenceMapWarmingError()
    }

    const servedFromMap = !livekitFallback && mapIsUsable
    const addresses = servedFromMap ? await fromPresenceMap(target) : await fromLivekit(target)

    if (shadowCompare && mapIsUsable) {
      await compareInShadow(
        target,
        addresses,
        servedFromMap ? () => fromLivekit(target) : () => fromPresenceMap(target)
      )
    }

    return addresses
  }

  return {
    getParticipantAddresses
  }
}
