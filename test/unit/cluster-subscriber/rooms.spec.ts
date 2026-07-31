import { resolveRoom, shardForWallet } from '../../../src/logic/cluster-subscriber/rooms'

describe('cluster-subscriber rooms', () => {
  describe('when computing a wallet shard', () => {
    describe('and there is only one shard', () => {
      it('should always return 0', () => {
        expect(shardForWallet('0xaaa', 1)).toBe(0)
      })
    })

    describe('and there are several shards', () => {
      it('should be stable across repeated calls', () => {
        const first = shardForWallet('0xabcdef0123456789', 7)
        expect(shardForWallet('0xabcdef0123456789', 7)).toBe(first)
        expect(shardForWallet('0xabcdef0123456789', 7)).toBe(first)
      })

      it('should be case insensitive, so checksum casing cannot split a wallet', () => {
        expect(shardForWallet('0xABCDEF0123456789', 7)).toBe(shardForWallet('0xabcdef0123456789', 7))
      })

      it('should always be within range', () => {
        for (let index = 0; index < 200; index++) {
          const shard = shardForWallet(`0xwallet${index}`, 5)
          expect(shard).toBeGreaterThanOrEqual(0)
          expect(shard).toBeLessThan(5)
        }
      })

      it('should spread wallets across every shard', () => {
        const used = new Set<number>()
        for (let index = 0; index < 500; index++) {
          used.add(shardForWallet(`0xwallet${index}`, 4))
        }
        expect(used.size).toBe(4)
      })
    })
  })

  describe('when resolving a room name', () => {
    describe('and the cluster is at or under the shard size', () => {
      it('should use the unsharded name', () => {
        expect(resolveRoom('C12', '0xaaa', 100, 100)).toEqual({ room: 'island-C12', shard: 0 })
        expect(resolveRoom('C12', '0xaaa', 1, 100)).toEqual({ room: 'island-C12', shard: 0 })
      })
    })

    describe('and the cluster is over the shard size', () => {
      it('should use the sharded name with the wallet shard', () => {
        const expectedShard = shardForWallet('0xaaa', 3)
        expect(resolveRoom('C12', '0xaaa', 300, 100)).toEqual({
          room: `island-C12:${expectedShard}`,
          shard: expectedShard
        })
      })

      it('should shard by one more at the first peer past the threshold', () => {
        const expectedShard = shardForWallet('0xaaa', 2)
        expect(resolveRoom('C12', '0xaaa', 101, 100)).toEqual({
          room: `island-C12:${expectedShard}`,
          shard: expectedShard
        })
      })
    })

    describe('and the cluster size is unknown because topology lags the event', () => {
      it('should fall back to the unsharded name and shard 0', () => {
        expect(resolveRoom('C99', '0xaaa', undefined, 100)).toEqual({ room: 'island-C99', shard: 0 })
      })
    })
  })
})
