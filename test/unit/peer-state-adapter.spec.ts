import { createPeerStateComponent, IPeerStateComponent } from '../../src/adapters/peer-state'
import { createConfigMockedComponent } from '../mocks/config-mock'

describe('peer-state adapter', () => {
  let peerState: IPeerStateComponent

  async function build(settings: { max?: number; ttl?: number } = {}): Promise<IPeerStateComponent> {
    const values: Record<string, number | undefined> = {
      CLUSTER_PEER_STATE_MAX: settings.max,
      CLUSTER_PEER_STATE_TTL_MS: settings.ttl
    }
    const config = createConfigMockedComponent({
      getNumber: jest.fn().mockImplementation((key: string) => Promise.resolve(values[key]))
    })

    return createPeerStateComponent({ config })
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('when a wallet has no stored assignment', () => {
    beforeEach(async () => {
      peerState = await build({ max: 10, ttl: 60_000 })
    })

    it('should return undefined', () => {
      expect(peerState.get('0xaaa')).toBeUndefined()
    })
  })

  describe('when an assignment is stored', () => {
    const assignment = { clusterId: 'C1', room: 'island-C1', lastSeen: 1000 }

    beforeEach(async () => {
      peerState = await build({ max: 10, ttl: 60_000 })
      peerState.set('0xaaa', assignment)
    })

    it('should return it', () => {
      expect(peerState.get('0xaaa')).toEqual(assignment)
    })
  })

  describe('when the TTL elapses', () => {
    beforeEach(async () => {
      // NOTE: lru-cache v10 does not respect Jest fake timers; using real timers here
      peerState = await build({ max: 10, ttl: 100 })
      peerState.set('0xaaa', { clusterId: 'C1', room: 'island-C1', lastSeen: 0 })
      await new Promise((resolve) => setTimeout(resolve, 150))
    })

    it('should expire the assignment, since the feed carries no disconnects', () => {
      expect(peerState.get('0xaaa')).toBeUndefined()
    })
  })

  describe('when more wallets are stored than the bound allows', () => {
    beforeEach(async () => {
      peerState = await build({ max: 2, ttl: 60_000 })
      peerState.set('0xa', { clusterId: 'C1', room: 'island-C1', lastSeen: 1 })
      peerState.set('0xb', { clusterId: 'C1', room: 'island-C1', lastSeen: 2 })
      peerState.set('0xc', { clusterId: 'C1', room: 'island-C1', lastSeen: 3 })
    })

    it('should keep only as many assignments as the bound allows', () => {
      expect(peerState.size()).toBe(2)
    })

    it('should evict the least recently used wallet', () => {
      expect(peerState.get('0xa')).toBeUndefined()
    })

    it('should keep the most recently stored wallet', () => {
      expect(peerState.get('0xc')).toBeDefined()
    })
  })

  describe('when no bounds are configured', () => {
    beforeEach(async () => {
      peerState = await build()
    })

    it('should fall back to its defaults instead of an unbounded cache', () => {
      peerState.set('0xaaa', { clusterId: 'C1', room: 'island-C1', lastSeen: 1 })

      expect(peerState.get('0xaaa')).toBeDefined()
    })
  })

  describe('when the bounds are configured as zero', () => {
    beforeEach(async () => {
      // lru-cache reads max 0 as "unbounded" and ttl 0 as "never expires" rather than
      // rejecting either, so a zero here would quietly remove both the size bound and the
      // only reclamation path this store has.
      peerState = await build({ max: 0, ttl: 0 })
      for (let i = 0; i < 5; i++) {
        peerState.set(`0x${i}`, { clusterId: 'C1', room: 'island-C1', lastSeen: i })
      }
    })

    it('should fall back to the bounded defaults', () => {
      expect(peerState.size()).toBe(5)
      expect(peerState.get('0x0')).toBeDefined()
    })
  })
})
