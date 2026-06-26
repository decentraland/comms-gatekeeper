import { Events } from '@dcl/schemas'
import { IPublisherComponent } from '@dcl/sns-component'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createPublisherMockedComponent } from '../../mocks/publisher-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createUserModerationComponent } from '../../../src/logic/user-moderation/component'
import {
  IUserModerationComponent,
  IUserModerationDatabaseComponent,
  UserBan,
  UserWarning
} from '../../../src/logic/user-moderation/types'
import { PlayerAlreadyBannedError, BanNotFoundError } from '../../../src/logic/user-moderation/errors'
import { IPlayerConnectionDBComponent } from '../../../src/adapters/db/types'
import { ILivekitComponent } from '../../../src/types/livekit.type'
import { makeBan, makeWarning } from './utils'

const flushPromises = () => new Promise(setImmediate)

describe('user-moderation-component', () => {
  let mockUserModerationDb: jest.Mocked<IUserModerationDatabaseComponent>
  let mockPlayerConnectionDb: jest.Mocked<IPlayerConnectionDBComponent>
  let mockPublisher: jest.Mocked<IPublisherComponent>
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockLivekit: jest.Mocked<Pick<ILivekitComponent, 'removeParticipantFromAllRooms'>>
  let component: IUserModerationComponent

  beforeEach(() => {
    mockUserModerationDb = {
      createBan: jest.fn(),
      liftBan: jest.fn(),
      isPlayerBanned: jest.fn(),
      getActiveBanForConnection: jest.fn(),
      getActiveBans: jest.fn(),
      createWarning: jest.fn(),
      getPlayerWarnings: jest.fn(),
      getBanHistory: jest.fn()
    }

    // By default the player has no recorded connection info, so bans capture no device/IP.
    mockPlayerConnectionDb = {
      upsertPlayerConnection: jest.fn().mockResolvedValue(undefined),
      getByAddress: jest.fn().mockResolvedValue(null)
    }

    mockPublisher = createPublisherMockedComponent({})

    mockLogs = createLoggerMockedComponent({})

    mockLivekit = {
      removeParticipantFromAllRooms: jest.fn().mockResolvedValue(undefined)
    }

    component = createUserModerationComponent({
      userModerationDb: mockUserModerationDb,
      playerConnectionDb: mockPlayerConnectionDb,
      logs: mockLogs,
      publisher: mockPublisher,
      livekit: mockLivekit
    } as any)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when banning a player', () => {
    describe('and no duration is provided', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan()
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
        mockUserModerationDb.createBan.mockResolvedValueOnce(ban)
      })

      it('should create a permanent ban with expiresAt undefined', async () => {
        const result = await component.banPlayer('0xABC', '0xADMIN', 'Violation')

        expect(result).toEqual(ban)
        expect(mockUserModerationDb.createBan).toHaveBeenCalledWith({
          bannedAddress: '0xabc',
          bannedBy: '0xadmin',
          reason: 'Violation',
          customMessage: undefined,
          bannedDeviceId: null,
          bannedIp: null,
          expiresAt: undefined
        })
      })

      it('should publish a USER_BAN_CREATED event with correct metadata', async () => {
        await component.banPlayer('0xABC', '0xADMIN', 'Violation')

        await flushPromises()

        expect(mockPublisher.publishMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: Events.Type.MODERATION,
            subType: Events.SubType.Moderation.USER_BAN_CREATED,
            key: ban.id,
            timestamp: expect.any(Number),
            metadata: expect.objectContaining({
              id: ban.id,
              bannedAddress: ban.bannedAddress,
              bannedBy: ban.bannedBy,
              reason: ban.reason,
              bannedAt: ban.bannedAt.getTime(),
              expiresAt: null
            })
          })
        )
      })

      it('should kick the banned player from all rooms', async () => {
        await component.banPlayer('0xABC', '0xADMIN', 'Violation')

        await flushPromises()

        expect(mockLivekit.removeParticipantFromAllRooms).toHaveBeenCalledWith('0xabc')
      })
    })

    describe('and a duration is provided', () => {
      let ban: UserBan
      let duration: number

      beforeEach(() => {
        duration = 24 * 60 * 60 * 1000
        ban = makeBan({ expiresAt: new Date(Date.now() + duration) })
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
        mockUserModerationDb.createBan.mockResolvedValueOnce(ban)
      })

      it('should pass expiresAt to the adapter', async () => {
        const result = await component.banPlayer('0xABC', '0xADMIN', 'Violation', duration)

        expect(result).toEqual(ban)
        expect(mockUserModerationDb.createBan).toHaveBeenCalledWith(
          expect.objectContaining({
            expiresAt: expect.any(Date)
          })
        )
      })

      it('should publish a USER_BAN_CREATED event with expiresAt as unix ms', async () => {
        await component.banPlayer('0xABC', '0xADMIN', 'Violation', duration)

        await flushPromises()

        expect(mockPublisher.publishMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              expiresAt: ban.expiresAt!.getTime()
            })
          })
        )
      })
    })

    describe('and a custom message is provided', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan({ customMessage: 'You have been banned' })
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
        mockUserModerationDb.createBan.mockResolvedValueOnce(ban)
      })

      it('should pass the custom message through to the adapter', async () => {
        await component.banPlayer('0xABC', '0xADMIN', 'Violation', undefined, 'You have been banned')

        expect(mockUserModerationDb.createBan).toHaveBeenCalledWith(
          expect.objectContaining({
            customMessage: 'You have been banned'
          })
        )
      })

      it('should include customMessage in the published SNS event', async () => {
        await component.banPlayer('0xABC', '0xADMIN', 'Violation', undefined, 'You have been banned')

        await flushPromises()

        expect(mockPublisher.publishMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              customMessage: 'You have been banned'
            })
          })
        )
      })
    })

    describe('and the player has recorded connection info', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan()
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
        mockUserModerationDb.createBan.mockResolvedValueOnce(ban)
        mockPlayerConnectionDb.getByAddress.mockResolvedValueOnce({
          address: '0xabc',
          ipAddress: '1.2.3.4',
          deviceId: 'device-123',
          createdAt: 1,
          updatedAt: 2
        })
      })

      it('should always ban the recorded device id while leaving the IP unset', async () => {
        await component.banPlayer('0xABC', '0xADMIN', 'Violation')

        expect(mockUserModerationDb.createBan).toHaveBeenCalledWith(
          expect.objectContaining({
            bannedDeviceId: 'device-123',
            bannedIp: null
          })
        )
      })

      describe('and banIp is true', () => {
        it('should also ban the recorded IP address', async () => {
          await component.banPlayer('0xABC', '0xADMIN', 'Violation', undefined, undefined, true)

          expect(mockUserModerationDb.createBan).toHaveBeenCalledWith(
            expect.objectContaining({
              bannedDeviceId: 'device-123',
              bannedIp: '1.2.3.4'
            })
          )
        })
      })
    })

    describe('and loading the connection info fails', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan()
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
        mockUserModerationDb.createBan.mockResolvedValueOnce(ban)
        mockPlayerConnectionDb.getByAddress.mockRejectedValueOnce(new Error('db error'))
      })

      it('should still ban by address with no device id or IP', async () => {
        const result = await component.banPlayer('0xABC', '0xADMIN', 'Violation')

        expect(result).toEqual(ban)
        expect(mockUserModerationDb.createBan).toHaveBeenCalledWith(
          expect.objectContaining({
            bannedDeviceId: null,
            bannedIp: null
          })
        )
      })
    })

    describe('and removing participant from rooms fails', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan()
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
        mockUserModerationDb.createBan.mockResolvedValueOnce(ban)
        mockLivekit.removeParticipantFromAllRooms.mockRejectedValueOnce(new Error('LiveKit error'))
      })

      it('should not fail the ban operation', async () => {
        const result = await component.banPlayer('0xABC', '0xADMIN', 'Violation')

        expect(result).toEqual(ban)
      })
    })

    describe('and the player is already banned', () => {
      let existingBan: UserBan

      beforeEach(() => {
        existingBan = makeBan()
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: true, ban: existingBan })
      })

      it('should throw PlayerAlreadyBannedError', async () => {
        await expect(component.banPlayer('0xABC', '0xADMIN', 'Violation')).rejects.toThrow(PlayerAlreadyBannedError)
      })

      it('should not call createBan on the adapter', async () => {
        await expect(component.banPlayer('0xABC', '0xADMIN', 'Violation')).rejects.toThrow()

        expect(mockUserModerationDb.createBan).not.toHaveBeenCalled()
      })

      it('should not publish an SNS event', async () => {
        await expect(component.banPlayer('0xABC', '0xADMIN', 'Violation')).rejects.toThrow(PlayerAlreadyBannedError)

        expect(mockPublisher.publishMessage).not.toHaveBeenCalled()
      })

      it('should not attempt to kick the player from rooms', async () => {
        await expect(component.banPlayer('0xABC', '0xADMIN', 'Violation')).rejects.toThrow()

        expect(mockLivekit.removeParticipantFromAllRooms).not.toHaveBeenCalled()
      })
    })

    describe('and the player was previously banned but the ban was lifted', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan()
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
        mockUserModerationDb.createBan.mockResolvedValueOnce(ban)
      })

      it('should create a new ban successfully', async () => {
        const result = await component.banPlayer('0xABC', '0xADMIN', 'New violation')

        expect(result).toEqual(ban)
      })
    })

    describe('and the addresses have mixed casing', () => {
      beforeEach(() => {
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
        mockUserModerationDb.createBan.mockResolvedValueOnce(makeBan())
      })

      it('should normalize all addresses to lowercase', async () => {
        await component.banPlayer('0xABC', '0xADMIN', 'Violation')

        expect(mockUserModerationDb.isPlayerBanned).toHaveBeenCalledWith('0xabc')
        expect(mockUserModerationDb.createBan).toHaveBeenCalledWith(
          expect.objectContaining({
            bannedAddress: '0xabc',
            bannedBy: '0xadmin'
          })
        )
      })
    })

    describe('and SNS publish fails', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan()
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
        mockUserModerationDb.createBan.mockResolvedValueOnce(ban)
        mockPublisher.publishMessage.mockRejectedValueOnce(new Error('SNS error'))
      })

      it('should not fail the ban operation', async () => {
        const result = await component.banPlayer('0xABC', '0xADMIN', 'Violation')

        expect(result).toEqual(ban)
      })
    })
  })

  describe('when lifting a ban', () => {
    describe('and an active ban exists', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan({ liftedAt: new Date('2025-06-01'), liftedBy: '0xadmin' })
        mockUserModerationDb.liftBan.mockResolvedValueOnce(ban)
      })

      it('should delegate to the adapter with normalized addresses', async () => {
        await component.liftBan('0xABC', '0xADMIN')

        expect(mockUserModerationDb.liftBan).toHaveBeenCalledWith('0xabc', '0xadmin')
      })

      it('should publish a USER_BAN_LIFTED event with correct metadata', async () => {
        await component.liftBan('0xABC', '0xADMIN')

        await flushPromises()

        expect(mockPublisher.publishMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: Events.Type.MODERATION,
            subType: Events.SubType.Moderation.USER_BAN_LIFTED,
            key: ban.id,
            timestamp: expect.any(Number),
            metadata: expect.objectContaining({
              id: ban.id,
              bannedAddress: ban.bannedAddress,
              liftedBy: ban.liftedBy,
              liftedAt: ban.liftedAt!.getTime()
            })
          })
        )
      })
    })

    describe('and no active ban exists', () => {
      beforeEach(() => {
        mockUserModerationDb.liftBan.mockResolvedValueOnce(null)
      })

      it('should throw BanNotFoundError', async () => {
        await expect(component.liftBan('0xABC', '0xADMIN')).rejects.toThrow(BanNotFoundError)
      })

      it('should not publish an SNS event', async () => {
        await expect(component.liftBan('0xABC', '0xADMIN')).rejects.toThrow(BanNotFoundError)

        expect(mockPublisher.publishMessage).not.toHaveBeenCalled()
      })
    })

    describe('and SNS publish fails', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan({ liftedAt: new Date('2025-06-01'), liftedBy: '0xadmin' })
        mockUserModerationDb.liftBan.mockResolvedValueOnce(ban)
        mockPublisher.publishMessage.mockRejectedValueOnce(new Error('SNS error'))
      })

      it('should not fail the lift operation', async () => {
        await expect(component.liftBan('0xABC', '0xADMIN')).resolves.toBeUndefined()
      })
    })
  })

  describe('when warning a player', () => {
    let warning: UserWarning

    beforeEach(() => {
      warning = makeWarning()
      mockUserModerationDb.createWarning.mockResolvedValueOnce(warning)
    })

    it('should create a warning and return it', async () => {
      const result = await component.warnPlayer('0xABC', 'Minor violation', '0xADMIN')

      expect(result).toEqual(warning)
    })

    it('should delegate to the adapter with normalized addresses', async () => {
      await component.warnPlayer('0xABC', 'Minor violation', '0xADMIN')

      expect(mockUserModerationDb.createWarning).toHaveBeenCalledWith({
        warnedAddress: '0xabc',
        warnedBy: '0xadmin',
        reason: 'Minor violation'
      })
    })

    it('should publish a USER_WARNING_CREATED event with correct metadata', async () => {
      await component.warnPlayer('0xABC', 'Minor violation', '0xADMIN')

      await flushPromises()

      expect(mockPublisher.publishMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: Events.Type.MODERATION,
          subType: Events.SubType.Moderation.USER_WARNING_CREATED,
          key: 'warning-id',
          timestamp: expect.any(Number),
          metadata: expect.objectContaining({
            id: 'warning-id',
            warnedAddress: '0xabc',
            warnedBy: '0xadmin',
            reason: 'Minor violation'
          })
        })
      )
    })

    describe('and SNS publish fails', () => {
      beforeEach(() => {
        mockPublisher.publishMessage.mockRejectedValueOnce(new Error('SNS error'))
      })

      it('should not fail the warn operation', async () => {
        const result = await component.warnPlayer('0xABC', 'Minor violation', '0xADMIN')

        expect(result).toEqual(makeWarning())
      })
    })
  })

  describe('when checking if a player is banned', () => {
    describe('and the player has an active ban', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan()
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: true, ban })
      })

      it('should return isBanned true with the ban record', async () => {
        const result = await component.isPlayerBanned('0xABC')

        expect(result).toEqual({ isBanned: true, ban })
      })
    })

    describe('and the player has no active ban', () => {
      beforeEach(() => {
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
      })

      it('should return isBanned false', async () => {
        const result = await component.isPlayerBanned('0xABC')

        expect(result).toEqual({ isBanned: false })
      })
    })

    describe('and the address has mixed casing', () => {
      beforeEach(() => {
        mockUserModerationDb.isPlayerBanned.mockResolvedValueOnce({ isBanned: false })
      })

      it('should normalize the address to lowercase', async () => {
        await component.isPlayerBanned('0xABC')

        expect(mockUserModerationDb.isPlayerBanned).toHaveBeenCalledWith('0xabc')
      })
    })
  })

  describe('when getting an active ban for a connection', () => {
    describe('and a matching active ban exists', () => {
      let ban: UserBan

      beforeEach(() => {
        ban = makeBan()
        mockUserModerationDb.getActiveBanForConnection.mockResolvedValueOnce({ isBanned: true, ban })
      })

      it('should return isBanned true with the ban record', async () => {
        const result = await component.getActiveBanForConnection({ address: '0xABC', deviceId: 'd', ip: '1.2.3.4' })

        expect(result).toEqual({ isBanned: true, ban })
      })

      it('should delegate to the adapter with the address normalized to lowercase', async () => {
        await component.getActiveBanForConnection({ address: '0xABC', deviceId: 'd', ip: '1.2.3.4' })

        expect(mockUserModerationDb.getActiveBanForConnection).toHaveBeenCalledWith({
          address: '0xabc',
          deviceId: 'd',
          ip: '1.2.3.4'
        })
      })
    })

    describe('and no matching active ban exists', () => {
      beforeEach(() => {
        mockUserModerationDb.getActiveBanForConnection.mockResolvedValueOnce({ isBanned: false })
      })

      it('should return isBanned false', async () => {
        const result = await component.getActiveBanForConnection({ address: '0xABC' })

        expect(result).toEqual({ isBanned: false })
      })
    })
  })

  describe('when getting active bans', () => {
    describe('and there are active bans', () => {
      let bans: UserBan[]

      beforeEach(() => {
        bans = [makeBan(), makeBan({ id: 'ban-2', bannedAddress: '0xdef' })]
        mockUserModerationDb.getActiveBans.mockResolvedValueOnce(bans)
      })

      it('should return all active bans from the adapter', async () => {
        const result = await component.getActiveBans()

        expect(result).toEqual(bans)
      })
    })

    describe('and there are no active bans', () => {
      beforeEach(() => {
        mockUserModerationDb.getActiveBans.mockResolvedValueOnce([])
      })

      it('should return an empty array', async () => {
        const result = await component.getActiveBans()

        expect(result).toEqual([])
      })
    })
  })

  describe('when getting player warnings', () => {
    describe('and the player has warnings', () => {
      let warnings: UserWarning[]

      beforeEach(() => {
        warnings = [makeWarning(), makeWarning({ id: 'warning-2' })]
        mockUserModerationDb.getPlayerWarnings.mockResolvedValueOnce(warnings)
      })

      it('should return all warnings from the adapter', async () => {
        const result = await component.getPlayerWarnings('0xABC')

        expect(result).toEqual(warnings)
      })
    })

    describe('and the player has no warnings', () => {
      beforeEach(() => {
        mockUserModerationDb.getPlayerWarnings.mockResolvedValueOnce([])
      })

      it('should return an empty array', async () => {
        const result = await component.getPlayerWarnings('0xABC')

        expect(result).toEqual([])
      })
    })

    describe('and the address has mixed casing', () => {
      beforeEach(() => {
        mockUserModerationDb.getPlayerWarnings.mockResolvedValueOnce([])
      })

      it('should normalize the address to lowercase', async () => {
        await component.getPlayerWarnings('0xABC')

        expect(mockUserModerationDb.getPlayerWarnings).toHaveBeenCalledWith('0xabc')
      })
    })
  })
})
