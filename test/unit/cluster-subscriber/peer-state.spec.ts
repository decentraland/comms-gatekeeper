import { createPeerStateStore } from '../../../src/logic/cluster-subscriber/peer-state'

describe('cluster-subscriber peer state', () => {
  describe('when a wallet has no stored assignment', () => {
    it('should return undefined', () => {
      const store = createPeerStateStore({ max: 10, ttl: 60_000 })

      expect(store.get('0xaaa')).toBeUndefined()
    })
  })

  describe('when an assignment is stored', () => {
    it('should return it', () => {
      const store = createPeerStateStore({ max: 10, ttl: 60_000 })

      store.set('0xaaa', { clusterId: 'C1', room: 'island-C1', lastSeen: 1000 })

      expect(store.get('0xaaa')).toEqual({ clusterId: 'C1', room: 'island-C1', lastSeen: 1000 })
    })
  })

  describe('when the TTL elapses', () => {
    it('should expire the assignment, since the feed carries no disconnects', async () => {
      // NOTE: lru-cache v10 does not respect Jest fake timers; using real timers here
      const store = createPeerStateStore({ max: 10, ttl: 100 })
      store.set('0xaaa', { clusterId: 'C1', room: 'island-C1', lastSeen: 0 })

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(store.get('0xaaa')).toBeUndefined()
    })
  })

  describe('when more wallets are stored than the bound allows', () => {
    it('should evict so memory stays bounded', () => {
      const store = createPeerStateStore({ max: 2, ttl: 60_000 })

      store.set('0xa', { clusterId: 'C1', room: 'island-C1', lastSeen: 1 })
      store.set('0xb', { clusterId: 'C1', room: 'island-C1', lastSeen: 2 })
      store.set('0xc', { clusterId: 'C1', room: 'island-C1', lastSeen: 3 })

      expect(store.size()).toBe(2)
      expect(store.get('0xa')).toBeUndefined()
      expect(store.get('0xc')).toBeDefined()
    })
  })
})
