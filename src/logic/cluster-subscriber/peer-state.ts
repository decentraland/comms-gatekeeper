import { LRUCache } from 'lru-cache'

export type PeerAssignment = {
  clusterId: string
  shard: number
  /**
   * Stored rather than recomputed: `fromIslandId` needs the exact previous name, and
   * `clusterId` plus `shard` can't distinguish "shard 0 of 3" from "unsharded".
   */
  room: string
  /** Kept for legibility in logs and debugging; the cache TTL does the actual expiry. */
  lastSeen: number
}

export type IPeerStateStore = {
  get(wallet: string): PeerAssignment | undefined
  set(wallet: string, assignment: PeerAssignment): void
  size(): number
}

// TTL is the only reclamation path: Pulse's feed has no disconnect event, and a departed
// peer just stops appearing in `engine.islands`. `peer.*.disconnect` still exists but retires
// in iteration 2 and is lossy, so it's deliberately unused here.
export function createPeerStateStore(options: { max: number; ttl: number }): IPeerStateStore {
  const cache = new LRUCache<string, PeerAssignment>({ max: options.max, ttl: options.ttl })

  function get(wallet: string): PeerAssignment | undefined {
    return cache.get(wallet)
  }

  function set(wallet: string, assignment: PeerAssignment): void {
    cache.set(wallet, assignment)
  }

  function size(): number {
    return cache.size
  }

  return { get, set, size }
}
