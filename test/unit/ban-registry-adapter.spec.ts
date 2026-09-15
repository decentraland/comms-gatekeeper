import { ILoggerComponent, START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import {
  BanRegistryNotLoadedError,
  createBanRegistryComponent,
  IBanRegistryComponent
} from '../../src/adapters/ban-registry'
import { IUserModerationDatabaseComponent, UserBan } from '../../src/logic/user-moderation/types'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { makeBan } from './user-moderation/utils'

const ADDRESS = '0xaaa'
const OTHER_ADDRESS = '0xbbb'
const DEVICE = 'device-1'
const REFRESH_MS = 60_000

describe('ban registry adapter', () => {
  let registry: IBanRegistryComponent
  let getActiveBans: jest.Mock
  let logger: jest.Mocked<ILoggerComponent.ILogger>

  async function build(): Promise<IBanRegistryComponent> {
    const config = createConfigMockedComponent({
      getNumber: jest
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(key === 'BAN_REGISTRY_REFRESH_MS' ? REFRESH_MS : undefined)
        )
    })
    const logs = createLoggerMockedComponent({})
    const component = await createBanRegistryComponent({
      userModerationDb: { getActiveBans } as unknown as IUserModerationDatabaseComponent,
      config,
      logs
    })
    logger = logs.getLogger.mock.results[0].value

    return component
  }

  beforeEach(() => {
    jest.useFakeTimers()
    getActiveBans = jest.fn().mockResolvedValue([])
  })

  afterEach(async () => {
    await registry?.[STOP_COMPONENT]?.()
    jest.useRealTimers()
  })

  describe('when started with active bans in the database', () => {
    let addressBan: UserBan
    let deviceBan: UserBan

    beforeEach(async () => {
      addressBan = makeBan({ id: 'by-address', bannedAddress: ADDRESS, bannedAt: new Date('2025-01-01') })
      deviceBan = makeBan({
        id: 'by-device',
        bannedAddress: OTHER_ADDRESS,
        bannedDeviceId: DEVICE,
        bannedAt: new Date('2025-02-01')
      })
      getActiveBans.mockResolvedValue([addressBan, deviceBan])
      registry = await build()

      await registry[START_COMPONENT]!({} as never)
    })

    it('should report itself loaded', () => {
      expect(registry.isLoaded()).toBe(true)
    })

    it('should log how many bans it holds', () => {
      expect(logger.info).toHaveBeenCalledWith('Ban registry loaded 2 active ban(s)')
    })

    it('should match a ban by address, whatever the casing', () => {
      expect(registry.getActiveBanForConnection({ address: ADDRESS.toUpperCase() })).toEqual({
        isBanned: true,
        ban: addressBan
      })
    })

    it('should match a ban by device for another wallet on it', () => {
      expect(registry.getActiveBanForConnection({ address: '0xccc', deviceId: DEVICE })).toEqual({
        isBanned: true,
        ban: deviceBan
      })
    })

    it('should prefer the wallet own ban over a device match', () => {
      expect(registry.getActiveBanForConnection({ address: ADDRESS, deviceId: DEVICE })).toEqual({
        isBanned: true,
        ban: addressBan
      })
    })

    it('should report a wallet with neither as not banned', () => {
      expect(registry.getActiveBanForConnection({ address: '0xccc' })).toEqual({ isBanned: false })
    })

    it('should not match a device it was not asked about', () => {
      expect(registry.getActiveBanForConnection({ address: '0xccc', deviceId: null })).toEqual({ isBanned: false })
    })
  })

  describe('when a wallet has several active bans', () => {
    let older: UserBan
    let newer: UserBan

    beforeEach(async () => {
      older = makeBan({ id: 'older', bannedAddress: ADDRESS, bannedAt: new Date('2025-01-01') })
      newer = makeBan({ id: 'newer', bannedAddress: ADDRESS, bannedAt: new Date('2025-03-01') })
      getActiveBans.mockResolvedValue([older, newer])
      registry = await build()

      await registry[START_COMPONENT]!({} as never)
    })

    it('should answer with the most recent one, as the database query does', () => {
      expect(registry.getActiveBanForConnection({ address: ADDRESS })).toEqual({ isBanned: true, ban: newer })
    })
  })

  describe('when a ban has expired since it was loaded', () => {
    beforeEach(async () => {
      jest.setSystemTime(new Date('2025-06-01T00:00:00Z'))
      getActiveBans.mockResolvedValue([
        makeBan({ id: 'temporary', bannedAddress: ADDRESS, expiresAt: new Date('2025-06-01T00:00:30Z') })
      ])
      registry = await build()
      await registry[START_COMPONENT]!({} as never)

      jest.setSystemTime(new Date('2025-06-01T00:01:00Z'))
    })

    it('should no longer match it', () => {
      expect(registry.getActiveBanForConnection({ address: ADDRESS })).toEqual({ isBanned: false })
    })
  })

  describe('when a ban is added after loading', () => {
    let ban: UserBan

    beforeEach(async () => {
      registry = await build()
      await registry[START_COMPONENT]!({} as never)
      ban = makeBan({ id: 'fresh', bannedAddress: ADDRESS, bannedDeviceId: DEVICE })

      registry.add(ban)
    })

    it('should match it by address at once', () => {
      expect(registry.getActiveBanForConnection({ address: ADDRESS })).toEqual({ isBanned: true, ban })
    })

    it('should match it by device at once', () => {
      expect(registry.getActiveBanForConnection({ address: OTHER_ADDRESS, deviceId: DEVICE })).toEqual({
        isBanned: true,
        ban
      })
    })

    describe('and then removed', () => {
      beforeEach(() => {
        registry.remove(ban)
      })

      it('should match neither the address nor the device', () => {
        expect(registry.getActiveBanForConnection({ address: ADDRESS, deviceId: DEVICE })).toEqual({ isBanned: false })
      })
    })
  })

  describe('when the load fails at start', () => {
    beforeEach(async () => {
      getActiveBans.mockRejectedValueOnce(new Error('database unavailable'))
      registry = await build()

      await registry[START_COMPONENT]!({} as never)
    })

    it('should not report itself loaded', () => {
      expect(registry.isLoaded()).toBe(false)
    })

    it('should refuse lookups, so callers fall back to the database', () => {
      expect(() => registry.getActiveBanForConnection({ address: ADDRESS })).toThrow(BanRegistryNotLoadedError)
    })

    it('should warn that it is answering from the database for now', () => {
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('answering from the database'))
    })

    describe('and the next refresh succeeds', () => {
      let ban: UserBan

      beforeEach(async () => {
        ban = makeBan({ id: 'late', bannedAddress: ADDRESS })
        getActiveBans.mockResolvedValue([ban])

        await jest.advanceTimersByTimeAsync(REFRESH_MS)
      })

      it('should report itself loaded', () => {
        expect(registry.isLoaded()).toBe(true)
      })

      it('should answer from the reloaded bans', () => {
        expect(registry.getActiveBanForConnection({ address: ADDRESS })).toEqual({ isBanned: true, ban })
      })
    })
  })

  describe('when a refresh fails after a successful load', () => {
    let ban: UserBan

    beforeEach(async () => {
      ban = makeBan({ id: 'kept', bannedAddress: ADDRESS })
      getActiveBans.mockResolvedValueOnce([ban]).mockRejectedValueOnce(new Error('database unavailable'))
      registry = await build()
      await registry[START_COMPONENT]!({} as never)

      await jest.advanceTimersByTimeAsync(REFRESH_MS)
    })

    it('should keep the bans it had', () => {
      expect(registry.getActiveBanForConnection({ address: ADDRESS })).toEqual({ isBanned: true, ban })
    })

    it('should warn that it kept them', () => {
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('keeping the current ones'))
    })
  })

  describe('when a refresh brings a ban written behind the service back', () => {
    let ban: UserBan

    beforeEach(async () => {
      registry = await build()
      await registry[START_COMPONENT]!({} as never)
      ban = makeBan({ id: 'external', bannedAddress: ADDRESS })
      getActiveBans.mockResolvedValue([ban])

      await jest.advanceTimersByTimeAsync(REFRESH_MS)
    })

    it('should pick it up', () => {
      expect(registry.getActiveBanForConnection({ address: ADDRESS })).toEqual({ isBanned: true, ban })
    })
  })

  describe('when stopped', () => {
    beforeEach(async () => {
      registry = await build()
      await registry[START_COMPONENT]!({} as never)
      getActiveBans.mockClear()

      await registry[STOP_COMPONENT]!()
      await jest.advanceTimersByTimeAsync(REFRESH_MS * 2)
    })

    it('should refresh no more', () => {
      expect(getActiveBans).not.toHaveBeenCalled()
    })
  })
})
