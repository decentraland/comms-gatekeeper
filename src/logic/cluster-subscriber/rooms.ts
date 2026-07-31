import { ISLAND_ROOM_PREFIX } from '../../adapters/livekit'

// `island-` prefix is required, not cosmetic (see docs/ai-agent-context.md).
export function islandRoomName(clusterId: string): string {
  return `${ISLAND_ROOM_PREFIX}${clusterId}`
}
