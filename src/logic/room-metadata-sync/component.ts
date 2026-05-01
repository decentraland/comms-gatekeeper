import { Room } from 'livekit-server-sdk'
import { RoomType } from '@dcl/schemas'
import { AppComponents } from '../../types'
import { PlaceAttributes } from '../../types/places.type'
import { isErrorWithMessage } from '../errors'
import { IRoomMetadataSyncComponent } from './types'

/**
 * Cooldown (in seconds) applied to webhook-driven full refreshes. A busy scene
 * can trigger `participant_joined` hundreds of times per minute; the underlying
 * ban/admin state rarely changes that often, and mutations already update
 * metadata incrementally, so we throttle the redundant fetches here. Off-band
 * changes (e.g., a world owner editing their allow-list) are still picked up
 * on the next webhook after the cooldown elapses.
 */
const WEBHOOK_REFRESH_COOLDOWN_SECONDS = 60

const WEBHOOK_REFRESH_CACHE_KEY_PREFIX = 'room-metadata-sync:webhook-refresh:'

export function createRoomMetadataSyncComponent(
  components: Pick<
    AppComponents,
    'sceneBanManager' | 'sceneAdmins' | 'livekit' | 'places' | 'contentClient' | 'lands' | 'cache' | 'logs'
  >
): IRoomMetadataSyncComponent {
  const { sceneBanManager, sceneAdmins, livekit, places, contentClient, lands, cache, logs } = components
  const logger = logs.getLogger('room-metadata-sync')

  // Cache key namespace prevents collisions if `cache` is later shared with
  // other consumers.
  function refreshCacheKey(roomName: string): string {
    return `${WEBHOOK_REFRESH_CACHE_KEY_PREFIX}${roomName}`
  }

  async function refreshRoomMetadata(place: PlaceAttributes, roomName: string): Promise<void> {
    try {
      // Land-lease only applies to Genesis City scenes; skip the lookup for worlds.
      // `lands.getLeaseHoldersForParcels` handles its own errors and returns [] on
      // failure, so a flaky lease service won't poison this Promise.all and drop
      // bans/admins from the metadata write.
      const leaseLookup = place.world ? Promise.resolve<string[]>([]) : lands.getLeaseHoldersForParcels(place.positions)
      const [bannedAddresses, { addresses }, leaseAddresses] = await Promise.all([
        sceneBanManager.listBannedAddresses(place.id),
        sceneAdmins.getAdminsAndExtraAddresses(place),
        leaseLookup
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

  async function updateRoomMetadataForRoom(room: Room): Promise<void> {
    // Throttle: with hundreds of joins per minute on a busy scene, refreshing on
    // every webhook is wasteful. The cache entry's existence IS the cooldown
    // signal — the TTL handles eviction; the LRU cap handles bounded memory.
    // Mark upfront (not after success) so a persistent downstream failure can't
    // thrash; the next webhook after the cooldown elapses will retry.
    const cooldownKey = refreshCacheKey(room.name)
    const isCoolingDown = await cache.get(cooldownKey)
    if (isCoolingDown) {
      logger.debug(`Skipping refresh for ${room.name}: within cooldown window`)
      return
    }
    await cache.set(cooldownKey, true, WEBHOOK_REFRESH_COOLDOWN_SECONDS)

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
        // Non-world room reaching this branch must be `RoomType.SCENE`, which
        // `getRoomMetadataFromRoomName` only returns when it parsed a sceneId
        // from the room name. Guard explicitly so a malformed scene room name
        // surfaces as a logged warning instead of an unhandled exception.
        if (!sceneId) {
          logger.warn(`Room ${room.name} parsed as a scene but has no sceneId; skipping metadata refresh`)
          return
        }
        const entity = await contentClient.fetchEntityById(sceneId)
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
