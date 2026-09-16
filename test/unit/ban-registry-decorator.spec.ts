import { IBanRegistryComponent, withBanRegistry } from '../../src/adapters/ban-registry'
import { BanStatus, IUserModerationDatabaseComponent, UserBan } from '../../src/logic/user-moderation/types'
import { makeBan } from './user-moderation/utils'

describe('ban registry decorator', () => {
  let store: jest.Mocked<IUserModerationDatabaseComponent>
  let registry: jest.Mocked<IBanRegistryComponent>
  let decorated: IUserModerationDatabaseComponent
  let ban: UserBan

  beforeEach(() => {
    ban = makeBan()
    store = {
      createBan: jest.fn().mockResolvedValue(ban),
      liftBan: jest.fn().mockResolvedValue(ban),
      isPlayerBanned: jest.fn().mockResolvedValue({ isBanned: false }),
      getActiveBanForConnection: jest.fn().mockResolvedValue({ isBanned: false }),
      getActiveBans: jest.fn().mockResolvedValue([ban]),
      createWarning: jest.fn(),
      getPlayerWarnings: jest.fn(),
      getBanHistory: jest.fn()
    } as unknown as jest.Mocked<IUserModerationDatabaseComponent>
    registry = {
      isLoaded: jest.fn().mockReturnValue(true),
      getActiveBanForConnection: jest.fn().mockReturnValue({ isBanned: false }),
      add: jest.fn(),
      remove: jest.fn(),
      reload: jest.fn()
    } as unknown as jest.Mocked<IBanRegistryComponent>
    decorated = withBanRegistry(store, registry)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('when a ban is created through it', () => {
    let result: UserBan

    beforeEach(async () => {
      result = await decorated.createBan({ bannedAddress: '0xabc', bannedBy: '0xadmin', reason: 'Violation' })
    })

    it('should write it to the table', () => {
      expect(store.createBan).toHaveBeenCalledWith({ bannedAddress: '0xabc', bannedBy: '0xadmin', reason: 'Violation' })
    })

    it('should put the persisted ban into the registry', () => {
      expect(registry.add).toHaveBeenCalledWith(ban)
    })

    it('should return the persisted ban', () => {
      expect(result).toBe(ban)
    })
  })

  describe('when a ban is lifted through it', () => {
    beforeEach(async () => {
      await decorated.liftBan('0xabc', '0xadmin')
    })

    it('should take the lifted ban out of the registry', () => {
      expect(registry.remove).toHaveBeenCalledWith(ban)
    })
  })

  describe('when lifting finds no ban to lift', () => {
    beforeEach(async () => {
      store.liftBan.mockResolvedValue(null)

      await decorated.liftBan('0xabc', '0xadmin')
    })

    it('should touch the registry with nothing', () => {
      expect(registry.remove).not.toHaveBeenCalled()
    })
  })

  describe('when looking up a connection before the registry has loaded', () => {
    let result: BanStatus

    beforeEach(async () => {
      registry.isLoaded.mockReturnValue(false)
      store.getActiveBanForConnection.mockResolvedValue({ isBanned: true, ban })

      result = await decorated.getActiveBanForConnection({ address: '0xabc' })
    })

    it('should answer from the table', () => {
      expect(result).toEqual({ isBanned: true, ban })
      expect(registry.getActiveBanForConnection).not.toHaveBeenCalled()
    })
  })

  describe('when the registry says a connection is not banned', () => {
    let result: BanStatus

    beforeEach(async () => {
      result = await decorated.getActiveBanForConnection({ address: '0xabc', deviceId: 'device-1' })
    })

    it('should trust it without reading the table', () => {
      expect(result).toEqual({ isBanned: false })
      expect(store.getActiveBanForConnection).not.toHaveBeenCalled()
    })

    it('should have asked the registry with the same query', () => {
      expect(registry.getActiveBanForConnection).toHaveBeenCalledWith({ address: '0xabc', deviceId: 'device-1' })
    })
  })

  describe('when the registry says a connection is banned', () => {
    beforeEach(() => {
      registry.getActiveBanForConnection.mockReturnValue({ isBanned: true, ban })
    })

    describe('and the table agrees', () => {
      let result: BanStatus
      let fromTable: UserBan

      beforeEach(async () => {
        fromTable = makeBan({ reason: 'as persisted' })
        store.getActiveBanForConnection.mockResolvedValue({ isBanned: true, ban: fromTable })

        result = await decorated.getActiveBanForConnection({ address: '0xabc' })
      })

      it('should return the table record', () => {
        expect(result).toEqual({ isBanned: true, ban: fromTable })
      })

      it('should leave the registry as it is', () => {
        expect(registry.remove).not.toHaveBeenCalled()
      })
    })

    describe('and the table no longer has an active ban, because it was lifted or deleted behind the service', () => {
      let result: BanStatus

      beforeEach(async () => {
        store.getActiveBanForConnection.mockResolvedValue({ isBanned: false })

        result = await decorated.getActiveBanForConnection({ address: '0xabc' })
      })

      it('should answer not banned, so a stale entry can never keep a wallet out', () => {
        expect(result).toEqual({ isBanned: false })
      })

      it('should drop the stale entry from the registry', () => {
        expect(registry.remove).toHaveBeenCalledWith(ban)
      })
    })
  })

  describe('when any other method is called', () => {
    beforeEach(async () => {
      await decorated.getActiveBans()
    })

    it('should pass straight through to the table', () => {
      expect(store.getActiveBans).toHaveBeenCalled()
    })
  })
})
