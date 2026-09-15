import { ICacheStorageComponent } from '@dcl/core-commons'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createInMemoryCacheComponent } from '@dcl/memory-cache-component'
import { createModerationEpochComponent, IModerationEpochComponent } from '../../../src/adapters/moderation-epoch'
import { AccessState, createAccessGateComponent, IAccessGateComponent } from '../../../src/logic/access-gate'
import { createDeferred, flushMacrotask } from '../../utils'
import { createDenyListMockedComponent } from '../../mocks/denylist-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createUserModerationMockedComponent } from '../../mocks/user-moderation-mock'

const ADDRESS = '0x1111111111111111111111111111111111111111'

describe('access-gate component', () => {
  let accessGate: IAccessGateComponent
  let userModeration: ReturnType<typeof createUserModerationMockedComponent>
  let denyList: ReturnType<typeof createDenyListMockedComponent>
  let moderationEpoch: IModerationEpochComponent
  let logger: jest.Mocked<ILoggerComponent.ILogger>

  async function build(cacheTtlMs?: number, cacheOverride?: ICacheStorageComponent): Promise<IAccessGateComponent> {
    // The real in-memory cache and epoch, as in production; a short TTL when a test needs expiry,
    // and a caller-supplied cache when a test needs to hold a read open.
    const accessGateCache = cacheOverride ?? createInMemoryCacheComponent(cacheTtlMs ? { ttl: cacheTtlMs } : undefined)
    moderationEpoch = await createModerationEpochComponent()
    const logs = createLoggerMockedComponent({})
    const component = await createAccessGateComponent({
      userModeration,
      denyList,
      accessGateCache,
      moderationEpoch,
      logs
    })
    logger = logs.getLogger.mock.results[0].value

    return component
  }

  beforeEach(() => {
    userModeration = createUserModerationMockedComponent()
    denyList = createDenyListMockedComponent()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('when neither gate rejects the identity', () => {
    beforeEach(async () => {
      accessGate = await build()
    })

    it('should report both gates as clear', async () => {
      await expect(accessGate.getAccessState({ address: ADDRESS, deviceId: 'device-1' })).resolves.toEqual({
        isBanned: false,
        isDenylisted: false
      })
    })

    it('should widen the ban lookup with the supplied device id', async () => {
      await accessGate.getAccessState({ address: ADDRESS, deviceId: 'device-1' })

      expect(userModeration.getActiveBanForConnection).toHaveBeenCalledWith({ address: ADDRESS, deviceId: 'device-1' })
    })

    it('should run both lookups instead of short-circuiting on the first', async () => {
      await accessGate.getAccessState({ address: ADDRESS, deviceId: 'device-1' })

      expect(denyList.isDenylisted).toHaveBeenCalledWith(ADDRESS)
    })
  })

  describe('when the identity is platform banned', () => {
    beforeEach(async () => {
      userModeration.getActiveBanForConnection.mockResolvedValue({ isBanned: true })
      accessGate = await build()
    })

    it('should report the ban without applying any precedence of its own', async () => {
      await expect(accessGate.getAccessState({ address: ADDRESS })).resolves.toEqual({
        isBanned: true,
        isDenylisted: false
      })
    })
  })

  describe('when the identity is deny-listed', () => {
    beforeEach(async () => {
      denyList.isDenylisted.mockResolvedValue(true)
      accessGate = await build()
    })

    it('should report the deny list without applying any precedence of its own', async () => {
      await expect(accessGate.getAccessState({ address: ADDRESS })).resolves.toEqual({
        isBanned: false,
        isDenylisted: true
      })
    })
  })

  describe('when the ban lookup fails', () => {
    beforeEach(() => {
      userModeration.getActiveBanForConnection.mockRejectedValue(new Error('ban store unavailable'))
    })

    describe('and the caller did not ask to fail open', () => {
      beforeEach(async () => {
        accessGate = await build()
      })

      it('should propagate the error', async () => {
        await expect(accessGate.getAccessState({ address: ADDRESS })).rejects.toThrow('ban store unavailable')
      })
    })

    describe('and the caller asked to cache', () => {
      beforeEach(async () => {
        accessGate = await build()
        await expect(accessGate.getAccessState({ address: ADDRESS }, { cached: true })).rejects.toThrow()
        userModeration.getActiveBanForConnection.mockResolvedValue({ isBanned: false })

        await accessGate.getAccessState({ address: ADDRESS }, { cached: true })
      })

      it('should keep nothing from the failed call, so the next one queries again', () => {
        expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(2)
      })
    })

    describe('and the caller asked to fail open and to cache', () => {
      beforeEach(async () => {
        accessGate = await build()
        await accessGate.getAccessState({ address: ADDRESS }, { failOpenOnBanLookupError: true, cached: true })
        await accessGate.getAccessState({ address: ADDRESS }, { failOpenOnBanLookupError: true, cached: true })
      })

      it('should not keep the fail-open answer, so the next call retries the lookup', () => {
        expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(2)
      })
    })

    describe('and the caller asked to fail open', () => {
      beforeEach(async () => {
        accessGate = await build()
      })

      it('should report the identity as not banned', async () => {
        await expect(
          accessGate.getAccessState({ address: ADDRESS }, { failOpenOnBanLookupError: true })
        ).resolves.toEqual({ isBanned: false, isDenylisted: false })
      })

      it('should log the swallowed failure', async () => {
        await accessGate.getAccessState({ address: ADDRESS }, { failOpenOnBanLookupError: true })

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Error checking platform ban status`))
      })

      describe('and the identity is also deny-listed', () => {
        beforeEach(async () => {
          denyList.isDenylisted.mockResolvedValue(true)
          accessGate = await build()
        })

        it('should still enforce the deny list, which a shared catch would have discarded', async () => {
          await expect(
            accessGate.getAccessState({ address: ADDRESS }, { failOpenOnBanLookupError: true })
          ).resolves.toEqual({ isBanned: false, isDenylisted: true })
        })
      })
    })
  })

  describe('when the caller asks for a cached result', () => {
    beforeEach(async () => {
      accessGate = await build()

      await accessGate.getAccessState({ address: ADDRESS }, { cached: true })
    })

    describe('and asks again for the same identity within the TTL', () => {
      let second: AccessState

      beforeEach(async () => {
        // Flipped after the first call: a second query would now see a ban, so an unchanged
        // answer proves it came from the cache.
        userModeration.getActiveBanForConnection.mockResolvedValue({ isBanned: true })

        second = await accessGate.getAccessState({ address: ADDRESS }, { cached: true })
      })

      it('should answer without querying either gate again', () => {
        expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(1)
        expect(denyList.isDenylisted).toHaveBeenCalledTimes(1)
      })

      it('should return the answer it cached', () => {
        expect(second).toEqual({ isBanned: false, isDenylisted: false })
      })
    })

    describe('and asks again for the same identity without opting in', () => {
      beforeEach(async () => {
        await accessGate.getAccessState({ address: ADDRESS })
      })

      it('should query again, since a token request wants the current answer', () => {
        expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(2)
      })
    })

    describe('and asks for the same address widened to a device id', () => {
      beforeEach(async () => {
        await accessGate.getAccessState({ address: ADDRESS, deviceId: 'device-1' }, { cached: true })
      })

      it('should query again, since the device changes what the ban check covers', () => {
        expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(2)
      })
    })

    describe('and asks for the same address in a different casing', () => {
      beforeEach(async () => {
        await accessGate.getAccessState({ address: ADDRESS.toUpperCase() }, { cached: true })
      })

      it('should answer from the same entry', () => {
        expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('when a moderation change lands after a decision was cached', () => {
    beforeEach(async () => {
      accessGate = await build()
      await accessGate.getAccessState({ address: ADDRESS }, { cached: true })
      moderationEpoch.bump()
      userModeration.getActiveBanForConnection.mockResolvedValue({ isBanned: true })
    })

    it('should query again and report the ban, treating the cached decision as stale', async () => {
      await expect(accessGate.getAccessState({ address: ADDRESS }, { cached: true })).resolves.toEqual({
        isBanned: true,
        isDenylisted: false
      })
      expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(2)
    })
  })

  describe('when a moderation change lands while a cached lookup is still in flight', () => {
    let firstLookup: ReturnType<typeof createDeferred<{ isBanned: boolean }>>
    let first: AccessState

    beforeEach(async () => {
      // The lookup read "allowed" before the ban committed. Left alone it would be returned to the
      // caller, which mints from it, and written back to the cache.
      firstLookup = createDeferred<{ isBanned: boolean }>()
      userModeration.getActiveBanForConnection.mockReturnValueOnce(firstLookup.promise)
      accessGate = await build()

      const pending = accessGate.getAccessState({ address: ADDRESS }, { cached: true })
      // Let the cache read settle so the ban lookup is genuinely in flight when the ban lands: a
      // ban that commits before the lookup starts is simply seen by the lookup.
      await flushMacrotask()
      moderationEpoch.bump()
      userModeration.getActiveBanForConnection.mockResolvedValue({ isBanned: true })
      firstLookup.resolve({ isBanned: false })

      first = await pending
    })

    it('should revalidate the decision in that same call and report the ban', () => {
      expect(first).toEqual({ isBanned: true, isDenylisted: false })
    })

    it('should have queried the gates exactly once more', () => {
      expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(2)
    })

    it('should serve the revalidated decision from the cache afterwards', async () => {
      await expect(accessGate.getAccessState({ address: ADDRESS }, { cached: true })).resolves.toEqual({
        isBanned: true,
        isDenylisted: false
      })
      expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(2)
    })
  })

  describe('when moderation keeps changing while a cached lookup is retried', () => {
    let result: AccessState

    beforeEach(async () => {
      // Every pass sees a fresh moderation change. The retry is bounded, and its answer is the
      // newest one available, so it is what the caller gets.
      userModeration.getActiveBanForConnection.mockImplementation(async () => {
        moderationEpoch.bump()
        return { isBanned: false }
      })
      accessGate = await build()

      result = await accessGate.getAccessState({ address: ADDRESS }, { cached: true })
    })

    it('should stop after one retry', () => {
      expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(2)
    })

    it('should return the newest decision', () => {
      expect(result).toEqual({ isBanned: false, isDenylisted: false })
    })

    it('should cache nothing, since no decision survived its own epoch', async () => {
      await accessGate.getAccessState({ address: ADDRESS }, { cached: true })

      expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(4)
    })
  })

  describe('when a moderation change lands while the decision is being written to the cache', () => {
    let cacheWrite: ReturnType<typeof createDeferred<void>>
    let result: AccessState

    beforeEach(async () => {
      // The one remaining await after the lookups: a ban landing here would otherwise slip past a
      // check made before the write.
      cacheWrite = createDeferred<void>()
      const pausedCache = { ...createInMemoryCacheComponent(), set: jest.fn().mockReturnValueOnce(cacheWrite.promise) }
      accessGate = await build(undefined, pausedCache as unknown as ICacheStorageComponent)

      const pending = accessGate.getAccessState({ address: ADDRESS }, { cached: true })
      await flushMacrotask()
      moderationEpoch.bump()
      userModeration.getActiveBanForConnection.mockResolvedValue({ isBanned: true })
      cacheWrite.resolve()

      result = await pending
    })

    it('should revalidate the decision and report the ban', () => {
      expect(result).toEqual({ isBanned: true, isDenylisted: false })
    })
  })

  describe('when a moderation change lands while a cached decision is being read', () => {
    let cacheRead: ReturnType<typeof createDeferred<{ state: AccessState; epoch: number } | null>>
    let result: AccessState

    beforeEach(async () => {
      // The read is held open; the entry it returns was cached as "allowed" under the epoch that was
      // current when the read began. The ban lands while the read is still in flight.
      cacheRead = createDeferred<{ state: AccessState; epoch: number } | null>()
      const pausedCache = { ...createInMemoryCacheComponent(), get: jest.fn().mockReturnValueOnce(cacheRead.promise) }
      accessGate = await build(undefined, pausedCache as unknown as ICacheStorageComponent)
      const epochWhenReadBegan = moderationEpoch.current()

      const pending = accessGate.getAccessState({ address: ADDRESS }, { cached: true })
      moderationEpoch.bump()
      userModeration.getActiveBanForConnection.mockResolvedValue({ isBanned: true })
      cacheRead.resolve({ state: { isBanned: false, isDenylisted: false }, epoch: epochWhenReadBegan })

      result = await pending
    })

    it('should not accept the pre-ban decision the read returned', () => {
      expect(result).toEqual({ isBanned: true, isDenylisted: false })
    })

    it('should query the gates instead', () => {
      expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(1)
    })
  })

  describe('when a cached result has outlived the TTL', () => {
    let performanceNow: jest.SpyInstance
    let nowMs: number

    beforeEach(async () => {
      // lru-cache keeps its own reference to `performance`, taken when it was imported. Jest's fake
      // timers swap the global for a fake rather than patching it, so advancing the fake clock never
      // reaches the cache. Spying on the real object's `now` does, with no real waiting.
      nowMs = 1_000_000
      performanceNow = jest.spyOn(performance, 'now').mockImplementation(() => nowMs)
      accessGate = await build(50)
      await accessGate.getAccessState({ address: ADDRESS }, { cached: true })
      nowMs += 60

      await accessGate.getAccessState({ address: ADDRESS }, { cached: true })
    })

    afterEach(() => {
      performanceNow.mockRestore()
    })

    it('should query again', () => {
      expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(2)
    })
  })

  describe('when the deny list lookup fails', () => {
    beforeEach(async () => {
      denyList.isDenylisted.mockRejectedValue(new Error('deny list unavailable'))
      accessGate = await build()
    })

    it('should propagate the error even when the ban lookup is set to fail open', async () => {
      await expect(accessGate.getAccessState({ address: ADDRESS }, { failOpenOnBanLookupError: true })).rejects.toThrow(
        'deny list unavailable'
      )
    })
  })
})
