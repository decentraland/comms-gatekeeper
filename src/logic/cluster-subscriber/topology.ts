import { IslandStatusMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'

export type IClusterTopology = {
  /** Replaces the snapshot. */
  update(message: IslandStatusMessage): void
  /** Member count for a cluster, or `undefined` when it is not in the latest snapshot. */
  getSize(clusterId: string): number | undefined
  clusterCount(): number
}

// Replacement is wholesale, not merged: Pulse rebuilds the whole-world snapshot every pass,
// so a missing cluster no longer exists and merging would keep it alive forever. Rosters
// aren't retained - sizes are all sharding needs.
export function createClusterTopology(): IClusterTopology {
  let sizes = new Map<string, number>()

  function update(message: IslandStatusMessage): void {
    const next = new Map<string, number>()
    for (const island of message.data) {
      next.set(island.id, island.peers.length)
    }
    sizes = next
  }

  function getSize(clusterId: string): number | undefined {
    return sizes.get(clusterId)
  }

  function clusterCount(): number {
    return sizes.size
  }

  return { update, getSize, clusterCount }
}
