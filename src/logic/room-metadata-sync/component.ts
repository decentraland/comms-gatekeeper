import { Room } from 'livekit-server-sdk'
import { RoomType } from '@dcl/schemas'
import { AppComponents } from '../../types'
import { PlaceAttributes } from '../../types/places.type'
import { isErrorWithMessage } from '../errors'
import { IRoomMetadataSyncComponent } from './types'

/**
 * Cooldown applied to webhook-driven full refreshes. A busy scene can trigger
 * `participant_joined` hundreds of times per minute; the underlying ban/admin
 * state rarely changes that often, and mutations already update metadata
 * incrementally, so we throttle the redundant fetches here. Off-band changes
 * (e.g., a world owner editing their allow-list) are still picked up on the
 * next webhook after the cooldown elapses.
 */
const WEBHOOK_REFRESH_COOLDOWN_MS = 60_000

export function createRoomMetadataSyncComponent(
  components: Pick<
    AppComponents,
    'sceneBanManager' | 'sceneAdmins' | 'livekit' | 'places' | 'contentClient' | 'landLease' | 'logs'
  >
): IRoomMetadataSyncComponent {
  const { sceneBanManager, sceneAdmins, livekit, places, contentClient, landLease, logs } = components
  const logger = logs.getLogger('room-metadata-sync')

  // Per-room timestamp of the last webhook-initiated refresh. Used to throttle
  // updateRoomMetadataForRoom; the explicit refreshRoomMetadata path bypasses it.
  const lastWebhookRefreshAt = new Map<string, number>()

  /**
   * Returns the lowercase land-lease holder addresses whose authorized plots overlap
   * with this place's positions. Land-lease only applies to Genesis City scenes.
   *
   * `getAdminsAndExtraAddresses` does NOT include lease holders today, but `isSceneOwnerOrAdmin`
   * grants admin permissions to them — so for the metadata to reflect the same set of effective
   * admins, we have to include them here.
   */
  async function getLandLeaseAddresses(place: PlaceAttributes): Promise<string[]> {
    if (place.world) return []

    // Failures here MUST NOT abort the surrounding Promise.all in refreshRoomMetadata —
    // otherwise a flaky lease service would also drop bans and admins from the metadata
    // write. Catch locally and degrade to an empty list; the next refresh retries.
    try {
      const { authorizations } = await landLease.getAuthorizations()
      if (!authorizations) return []

      const leaseAddresses = new Set<string>()
      for (const auth of authorizations) {
        const overlaps = place.positions.some((position) => auth.plots.includes(position))
        if (overlaps) {
          for (const address of auth.addresses) {
            leaseAddresses.add(address.toLowerCase())
          }
        }
      }
      return Array.from(leaseAddresses)
    } catch (error) {
      logger.warn(
        `Failed to fetch land-lease authorizations for place ${place.id}: ${
          isErrorWithMessage(error) ? error.message : 'Unknown error'
        }`
      )
      return []
    }
  }

  async function refreshRoomMetadata(place: PlaceAttributes, roomName: string): Promise<void> {
    try {
      const [bannedAddresses, { addresses }, leaseAddresses] = await Promise.all([
        sceneBanManager.listBannedAddresses(place.id),
        sceneAdmins.getAdminsAndExtraAddresses(place),
        getLandLeaseAddresses(place)
      ])

      const sceneAdminsArray = Array.from(new Set([...addresses, ...leaseAddresses]))

      await livekit.updateRoomMetadata(roomName, {
        bannedAddresses,
        sceneAdmins: sceneAdminsArray
      })

      logger.debug(
        `Updated room metadata for ${roomName}: ${bannedAddresses.length} bans, ${sceneAdminsArray.length} admins`
      )
    } catch (error) {
      logger.warn(
        `Failed to update room metadata for place ${place.id}: ${
          isErrorWithMessage(error) ? error.message : 'Unknown error'
        }`
      )
    }
  }

  // Lazy GC: every time we set a new timestamp, also drop entries older than 2x the
  // cooldown so the map can't grow unbounded on long-running instances. Cheap because
  // it only runs when we'd refresh anyway, and the work is O(map size).
  function pruneStaleRefreshEntries(now: number): void {
    const cutoff = now - 2 * WEBHOOK_REFRESH_COOLDOWN_MS
    for (const [roomName, timestamp] of lastWebhookRefreshAt) {
      if (timestamp < cutoff) {
        lastWebhookRefreshAt.delete(roomName)
      }
    }
  }

  async function updateRoomMetadataForRoom(room: Room): Promise<void> {
    // Throttle: with hundreds of joins per minute on a busy scene, refreshing on
    // every webhook is wasteful. The check-and-set is synchronous so concurrent
    // webhooks for the same room can't both pass the gate. We mark the timestamp
    // upfront (not after success) to avoid retry thrash on persistent failures —
    // the next webhook after the cooldown will retry.
    const now = Date.now()
    const lastRefresh = lastWebhookRefreshAt.get(room.name)
    if (lastRefresh !== undefined && now - lastRefresh < WEBHOOK_REFRESH_COOLDOWN_MS) {
      logger.debug(`Skipping refresh for ${room.name}: last refresh ${now - lastRefresh}ms ago`)
      return
    }
    lastWebhookRefreshAt.set(room.name, now)
    pruneStaleRefreshEntries(now)

    try {
      const { sceneId, worldName, roomType } = livekit.getRoomMetadataFromRoomName(room.name)

      if (roomType !== RoomType.SCENE && roomType !== RoomType.WORLD) {
        logger.warn(`Room ${room.name} is not a scene or world room, skipping metadata refresh`)
        return
      }

      let place: PlaceAttributes

      if (worldName && sceneId) {
        place = await places.getWorldScenePlaceByEntityId(worldName, sceneId)
      } else if (worldName) {
        // Legacy rooms without sceneId: fall back to world-level lookup
        place = await places.getWorldByName(worldName)
      } else {
        const entity = await contentClient.fetchEntityById(sceneId!)
        place = await places.getPlaceByParcel(entity.metadata.scene.base)
      }

      await refreshRoomMetadata(place, room.name)
    } catch (error) {
      logger.error(`Error updating room metadata for room ${room.name}`, {
        error: isErrorWithMessage(error) ? error.message : 'Unknown error'
      })
    }
  }

  async function mutateRoomMetadataArray(
    roomName: string,
    field: 'bannedAddresses' | 'sceneAdmins',
    address: string,
    op: 'append' | 'remove'
  ): Promise<void> {
    try {
      if (op === 'append') {
        await livekit.appendToRoomMetadataArray(roomName, field, address)
      } else {
        await livekit.removeFromRoomMetadataArray(roomName, field, address)
      }
    } catch (error) {
      logger.warn(
        `Failed to ${op} ${address} in ${field} for room ${roomName}: ${
          isErrorWithMessage(error) ? error.message : 'Unknown error'
        }`
      )
    }
  }

  return {
    refreshRoomMetadata,
    updateRoomMetadataForRoom,
    addBan: (roomName, address) => mutateRoomMetadataArray(roomName, 'bannedAddresses', address, 'append'),
    removeBan: (roomName, address) => mutateRoomMetadataArray(roomName, 'bannedAddresses', address, 'remove'),
    addAdmin: (roomName, address) => mutateRoomMetadataArray(roomName, 'sceneAdmins', address, 'append'),
    removeAdmin: (roomName, address) => mutateRoomMetadataArray(roomName, 'sceneAdmins', address, 'remove')
  }
}
