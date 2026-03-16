import { ILoggerComponent } from '@well-known-components/interfaces'
import { createUserModerationComponent } from '../../src/logic/user-moderation/component'
import { IUserModerationComponent, IUserModerationDatabaseComponent } from '../../src/logic/user-moderation/types'
import { PlayerAlreadyBannedError, BanNotFoundError } from '../../src/logic/user-moderation/errors'
import { createLoggerMockedComponent } from '../mocks/logger-mock'

describe('UserModerationComponent', () => {
  let mockedLogs: jest.Mocked<ILoggerComponent>
  let mockedDb: jest.Mocked<IUserModerationDatabaseComponent>
  let component: IUserModerationComponent

  beforeEach(() => {
    mockedLogs = createLoggerMockedComponent()
    mockedDb = {
      createBan: jest.fn(),
      liftBan: jest.fn(),
      isPlayerBanned: jest.fn(),
      getActiveBans: jest.fn(),
      createWarning: jest.fn(),
      getPlayerWarnings: jest.fn(),
      getBanHistory: jest.fn()
    }

    component = createUserModerationComponent({
      userModerationDb: mockedDb,
      logs: mockedLogs
    } as any)
  })

  describe('banPlayer', () => {
    const address = '0x1234567890123456789012345678901234567890'
    const bannedBy = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12'

    it('should create a permanent ban', async () => {
      mockedDb.isPlayerBanned.mockResolvedValue({ isBanned: false })
      mockedDb.createBan.mockResolvedValue({
        id: 'ban-id',
        bannedAddress: address.toLowerCase(),
        bannedBy: bannedBy.toLowerCase(),
        reason: 'Spamming',
        customMessage: null,
        bannedAt: new Date(),
        expiresAt: null,
        liftedAt: null,
        liftedBy: null,
        createdAt: new Date()
      })

      const result = await component.banPlayer(address, bannedBy, 'Spamming')

      expect(mockedDb.createBan).toHaveBeenCalledWith({
        bannedAddress: address.toLowerCase(),
        bannedBy: bannedBy.toLowerCase(),
        reason: 'Spamming',
        customMessage: undefined,
        expiresAt: undefined
      })
      expect(result.bannedAddress).toBe(address.toLowerCase())
      expect(result.expiresAt).toBeNull()
    })

    it('should create a timed ban with duration', async () => {
      mockedDb.isPlayerBanned.mockResolvedValue({ isBanned: false })
      mockedDb.createBan.mockResolvedValue({
        id: 'ban-id',
        bannedAddress: address.toLowerCase(),
        bannedBy: bannedBy.toLowerCase(),
        reason: 'Temporary',
        customMessage: null,
        bannedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        liftedAt: null,
        liftedBy: null,
        createdAt: new Date()
      })

      await component.banPlayer(address, bannedBy, 'Temporary', 3600000)

      expect(mockedDb.createBan).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: expect.any(Date)
        })
      )
    })

    it('should pass custom message', async () => {
      mockedDb.isPlayerBanned.mockResolvedValue({ isBanned: false })
      mockedDb.createBan.mockResolvedValue({
        id: 'ban-id',
        bannedAddress: address.toLowerCase(),
        bannedBy: bannedBy.toLowerCase(),
        reason: 'Test',
        customMessage: 'Custom msg',
        bannedAt: new Date(),
        expiresAt: null,
        liftedAt: null,
        liftedBy: null,
        createdAt: new Date()
      })

      await component.banPlayer(address, bannedBy, 'Test', undefined, 'Custom msg')

      expect(mockedDb.createBan).toHaveBeenCalledWith(
        expect.objectContaining({
          customMessage: 'Custom msg'
        })
      )
    })

    it('should throw PlayerAlreadyBannedError if already banned', async () => {
      mockedDb.isPlayerBanned.mockResolvedValue({
        isBanned: true,
        ban: {} as any
      })

      await expect(component.banPlayer(address, bannedBy, 'Test')).rejects.toThrow(PlayerAlreadyBannedError)
    })

    it('should normalize addresses to lowercase', async () => {
      const mixedCaseAddress = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'
      mockedDb.isPlayerBanned.mockResolvedValue({ isBanned: false })
      mockedDb.createBan.mockResolvedValue({} as any)

      await component.banPlayer(mixedCaseAddress, mixedCaseAddress, 'Test')

      expect(mockedDb.isPlayerBanned).toHaveBeenCalledWith(mixedCaseAddress.toLowerCase())
      expect(mockedDb.createBan).toHaveBeenCalledWith(
        expect.objectContaining({
          bannedAddress: mixedCaseAddress.toLowerCase(),
          bannedBy: mixedCaseAddress.toLowerCase()
        })
      )
    })
  })

  describe('liftBan', () => {
    const address = '0x1234567890123456789012345678901234567890'
    const liftedBy = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12'

    it('should lift an active ban', async () => {
      mockedDb.liftBan.mockResolvedValue(true)

      await component.liftBan(address, liftedBy)

      expect(mockedDb.liftBan).toHaveBeenCalledWith(address.toLowerCase(), liftedBy.toLowerCase())
    })

    it('should throw BanNotFoundError if no active ban', async () => {
      mockedDb.liftBan.mockResolvedValue(false)

      await expect(component.liftBan(address, liftedBy)).rejects.toThrow(BanNotFoundError)
    })
  })

  describe('warnPlayer', () => {
    const address = '0x1234567890123456789012345678901234567890'
    const warnedBy = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12'

    it('should create a warning', async () => {
      mockedDb.createWarning.mockResolvedValue({
        id: 'warn-id',
        warnedAddress: address.toLowerCase(),
        warnedBy: warnedBy.toLowerCase(),
        reason: 'Bad behavior',
        warnedAt: new Date(),
        createdAt: new Date()
      })

      const result = await component.warnPlayer(address, 'Bad behavior', warnedBy)

      expect(mockedDb.createWarning).toHaveBeenCalledWith({
        warnedAddress: address.toLowerCase(),
        warnedBy: warnedBy.toLowerCase(),
        reason: 'Bad behavior'
      })
      expect(result.warnedAddress).toBe(address.toLowerCase())
    })

    it('should normalize addresses', async () => {
      const mixedCase = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'
      mockedDb.createWarning.mockResolvedValue({} as any)

      await component.warnPlayer(mixedCase, 'Test', mixedCase)

      expect(mockedDb.createWarning).toHaveBeenCalledWith(
        expect.objectContaining({
          warnedAddress: mixedCase.toLowerCase(),
          warnedBy: mixedCase.toLowerCase()
        })
      )
    })
  })

  describe('isPlayerBanned', () => {
    it('should return ban status with normalized address', async () => {
      const address = '0xABCD1234567890ABCDEF1234567890ABCDEF1234'
      mockedDb.isPlayerBanned.mockResolvedValue({ isBanned: false })

      const result = await component.isPlayerBanned(address)

      expect(mockedDb.isPlayerBanned).toHaveBeenCalledWith(address.toLowerCase())
      expect(result.isBanned).toBe(false)
    })
  })

  describe('getActiveBans', () => {
    it('should return active bans', async () => {
      mockedDb.getActiveBans.mockResolvedValue([])

      const result = await component.getActiveBans()

      expect(result).toEqual([])
    })
  })

  describe('getPlayerWarnings', () => {
    it('should return warnings with normalized address', async () => {
      const address = '0xABCD1234567890ABCDEF1234567890ABCDEF1234'
      mockedDb.getPlayerWarnings.mockResolvedValue([])

      const result = await component.getPlayerWarnings(address)

      expect(mockedDb.getPlayerWarnings).toHaveBeenCalledWith(address.toLowerCase())
      expect(result).toEqual([])
    })
  })
})
