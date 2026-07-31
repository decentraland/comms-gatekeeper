import { IslandStatusMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import { createClusterTopology } from '../../../src/logic/cluster-subscriber/topology'

function snapshot(islands: { id: string; peers: string[] }[]): IslandStatusMessage {
  return {
    data: islands.map((island) => ({
      id: island.id,
      peers: island.peers,
      maxPeers: 0,
      center: { x: 0, y: 0, z: 0 },
      radius: 0
    }))
  }
}

describe('cluster-subscriber topology', () => {
  describe('when no snapshot has arrived', () => {
    it('should report every cluster as unknown', () => {
      const topology = createClusterTopology()

      expect(topology.getSize('C1')).toBeUndefined()
      expect(topology.clusterCount()).toBe(0)
    })
  })

  describe('when a snapshot arrives', () => {
    it('should derive each cluster size from its roster length', () => {
      const topology = createClusterTopology()

      topology.update(
        snapshot([
          { id: 'C1', peers: ['0xa', '0xb'] },
          { id: 'C2', peers: ['0xc'] }
        ])
      )

      expect(topology.getSize('C1')).toBe(2)
      expect(topology.getSize('C2')).toBe(1)
      expect(topology.clusterCount()).toBe(2)
    })

    it('should report clusters absent from the snapshot as unknown', () => {
      const topology = createClusterTopology()

      topology.update(snapshot([{ id: 'C1', peers: ['0xa'] }]))

      expect(topology.getSize('C9')).toBeUndefined()
    })

    it('should distinguish an empty roster (0) from an absent cluster (undefined)', () => {
      const topology = createClusterTopology()

      topology.update(
        snapshot([
          { id: 'C1', peers: ['0xa'] },
          { id: 'C2', peers: [] }
        ])
      )

      expect(topology.getSize('C2')).toBe(0)
      expect(topology.getSize('C3')).toBeUndefined()
    })
  })

  describe('when a later snapshot arrives', () => {
    it('should replace the previous one wholesale so a vanished cluster does not linger', () => {
      const topology = createClusterTopology()

      topology.update(
        snapshot([
          { id: 'C1', peers: ['0xa', '0xb'] },
          { id: 'C2', peers: ['0xc'] }
        ])
      )
      topology.update(snapshot([{ id: 'C2', peers: ['0xc', '0xd', '0xe'] }]))

      expect(topology.getSize('C1')).toBeUndefined()
      expect(topology.getSize('C2')).toBe(3)
      expect(topology.clusterCount()).toBe(1)
    })
  })
})
