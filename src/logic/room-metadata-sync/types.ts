import { Room } from 'livekit-server-sdk'
import { PlaceAttributes } from '../../types/places.type'

export interface IRoomMetadataSyncComponent {
  /**
   * Full reconciliation: fetch current bans and effective scene admins for a place and write
   * both keys to LiveKit room metadata in a single call.
   *
   * Use this from webhook handlers (room start, participant join) where the delta is unknown.
   * For ban/admin mutations where the delta IS known, prefer the incremental methods below —
   * they avoid re-querying the DB and worlds/lands services.
   *
   * Errors are caught and logged.
   */
  refreshRoomMetadata(place: PlaceAttributes, roomName: string): Promise<void>

  /**
   * Resolve the place from a LiveKit Room (by parsing its name) and refresh its metadata.
   * Skips rooms whose type is not SCENE or WORLD.
   *
   * Only `room.name` is read — the webhook-provided Room object's metadata snapshot is stale.
   */
  updateRoomMetadataForRoom(room: Room): Promise<void>

  /**
   * Incremental: append `address` to the room's `bannedAddresses` array.
   * Caller must have already verified the address is bannable (not owner/admin/extended).
   */
  addBan(roomName: string, address: string): Promise<void>

  /**
   * Incremental: remove `address` from the room's `bannedAddresses` array.
   */
  removeBan(roomName: string, address: string): Promise<void>

  /**
   * Incremental: append `address` to the room's `sceneAdmins` array.
   * Caller must have already verified the address is a new explicit admin (not owner/extended).
   */
  addAdmin(roomName: string, address: string): Promise<void>

  /**
   * Incremental: remove `address` from the room's `sceneAdmins` array.
   * Caller must have already verified the address has no extended permissions
   * (otherwise it should remain in the metadata as part of the union).
   */
  removeAdmin(roomName: string, address: string): Promise<void>
}
