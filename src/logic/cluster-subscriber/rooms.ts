import { createHash } from 'crypto'
import { ISLAND_ROOM_PREFIX } from '../../adapters/livekit'

// SHA-256 so every replica agrees without sharing state; lower-casing first keeps checksum-
// and lower-cased wallets in the same shard.
export function shardForWallet(wallet: string, shardCount: number): number {
  if (shardCount <= 1) {
    return 0
  }
  const digest = createHash('sha256').update(wallet.toLowerCase()).digest()
  return digest.readUInt32BE(0) % shardCount
}

// `size` is undefined when a cluster_change outruns the engine.islands snapshot; treated as
// unsharded since a cluster missing from it has almost certainly just formed. `island-` prefix
// is required, not cosmetic (see docs/ai-agent-context.md).
export function resolveRoom(
  clusterId: string,
  wallet: string,
  size: number | undefined,
  shardSize: number
): { room: string; shard: number } {
  if (size === undefined || size <= shardSize) {
    return { room: `${ISLAND_ROOM_PREFIX}${clusterId}`, shard: 0 }
  }

  const shardCount = Math.ceil(size / shardSize)
  const shard = shardForWallet(wallet, shardCount)

  return { room: `${ISLAND_ROOM_PREFIX}${clusterId}:${shard}`, shard }
}
