import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createIpModerationComponent, IIpModerationComponent } from '../../../src/logic/ip-moderation/component'
import { IIpModerationDatabaseComponent, IpBan } from '../../../src/logic/ip-moderation/types'
import { IpAlreadyBannedError, IpBanNotFoundError } from '../../../src/logic/ip-moderation/errors'
import { IUserModerationComponent } from '../../../src/logic/user-moderation/types'
import { makeIpBan } from './utils'
import { makeBan } from '../user-moderation/utils'

describe('ip-moderation-component', () => {
  let mockIpModerationDb: jest.Mocked<IIpModerationDatabaseComponent>
  let mockUserModeration: jest.Mocked<Pick<IUserModerationComponent, 'isPlayerBanned' | 'banPlayer'>>
  let mockLogs: jest.Mocked<ILoggerComponent>
  let component: IIpModerationComponent

  beforeEach(() => {
    mockIpModerationDb = {
      banIp: jest.fn(),
      liftIpBan: jest.fn(),
      getIpBanStatus: jest.fn(),
      logConnection: jest.fn(),
      getIpsByAddress: jest.fn(),
      getAddressesByIp: jest.fn()
    }

    mockUserModeration = {
      isPlayerBanned: jest.fn(),
      banPlayer: jest.fn()
    }

    mockLogs = createLoggerMockedComponent({})

    component = createIpModerationComponent({
      ipModerationDb: mockIpModerationDb,
      userModeration: mockUserModeration as any,
      logs: mockLogs
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when banning an IP', () => {
    describe('and the IP is not currently banned', () => {
      let ban: IpBan

      beforeEach(() => {
        ban = makeIpBan()
        mockIpModerationDb.getIpBanStatus.mockResolvedValueOnce({ isBanned: false })
        mockIpModerationDb.banIp.mockResolvedValueOnce(ban)
      })

      it('should create a permanent ban', async () => {
        const result = await component.banIp('1.2.3.4', '0xADMIN', 'Violation')

        expect(result).toEqual(ban)
        expect(mockIpModerationDb.banIp).toHaveBeenCalledWith({
          bannedIp: '1.2.3.4',
          bannedBy: '0xadmin',
          reason: 'Violation',
          customMessage: undefined,
          expiresAt: undefined
        })
      })

      it('should normalize IP and bannedBy to lowercase', async () => {
        await component.banIp('1.2.3.4', '0xADMIN', 'Violation')

        expect(mockIpModerationDb.getIpBanStatus).toHaveBeenCalledWith('1.2.3.4')
        expect(mockIpModerationDb.banIp).toHaveBeenCalledWith(
          expect.objectContaining({
            bannedIp: '1.2.3.4',
            bannedBy: '0xadmin'
          })
        )
      })
    })

    describe('and a duration is provided', () => {
      let ban: IpBan
      let duration: number

      beforeEach(() => {
        duration = 24 * 60 * 60 * 1000
        ban = makeIpBan({ expiresAt: new Date(Date.now() + duration) })
        mockIpModerationDb.getIpBanStatus.mockResolvedValueOnce({ isBanned: false })
        mockIpModerationDb.banIp.mockResolvedValueOnce(ban)
      })

      it('should pass expiresAt to the adapter', async () => {
        const result = await component.banIp('1.2.3.4', '0xADMIN', 'Violation', duration)

        expect(result).toEqual(ban)
        expect(mockIpModerationDb.banIp).toHaveBeenCalledWith(
          expect.objectContaining({
            expiresAt: expect.any(Date)
          })
        )
      })
    })

    describe('and the IP is already banned', () => {
      beforeEach(() => {
        mockIpModerationDb.getIpBanStatus.mockResolvedValueOnce({ isBanned: true, ban: makeIpBan() })
      })

      it('should throw IpAlreadyBannedError', async () => {
        await expect(component.banIp('1.2.3.4', '0xADMIN', 'Violation')).rejects.toThrow(IpAlreadyBannedError)
      })

      it('should not call banIp on the adapter', async () => {
        await expect(component.banIp('1.2.3.4', '0xADMIN', 'Violation')).rejects.toThrow()

        expect(mockIpModerationDb.banIp).not.toHaveBeenCalled()
      })
    })
  })

  describe('when lifting an IP ban', () => {
    describe('and an active ban exists', () => {
      let ban: IpBan

      beforeEach(() => {
        ban = makeIpBan({ liftedAt: new Date('2025-06-01'), liftedBy: '0xadmin' })
        mockIpModerationDb.liftIpBan.mockResolvedValueOnce(ban)
      })

      it('should delegate to the adapter with normalized values', async () => {
        await component.liftIpBan('1.2.3.4', '0xADMIN')

        expect(mockIpModerationDb.liftIpBan).toHaveBeenCalledWith('1.2.3.4', '0xadmin')
      })
    })

    describe('and no active ban exists', () => {
      beforeEach(() => {
        mockIpModerationDb.liftIpBan.mockResolvedValueOnce(null)
      })

      it('should throw IpBanNotFoundError', async () => {
        await expect(component.liftIpBan('1.2.3.4', '0xADMIN')).rejects.toThrow(IpBanNotFoundError)
      })
    })
  })

  describe('when checking IP ban status', () => {
    describe('and the IP is banned', () => {
      let ban: IpBan

      beforeEach(() => {
        ban = makeIpBan()
        mockIpModerationDb.getIpBanStatus.mockResolvedValueOnce({ isBanned: true, ban })
      })

      it('should return isBanned true with the ban record', async () => {
        const result = await component.getIpBanStatus('1.2.3.4')

        expect(result).toEqual({ isBanned: true, ban })
      })
    })

    describe('and the IP is not banned', () => {
      beforeEach(() => {
        mockIpModerationDb.getIpBanStatus.mockResolvedValueOnce({ isBanned: false })
      })

      it('should return isBanned false', async () => {
        const result = await component.getIpBanStatus('1.2.3.4')

        expect(result).toEqual({ isBanned: false })
      })
    })
  })

  describe('when logging a connection', () => {
    beforeEach(() => {
      mockIpModerationDb.logConnection.mockResolvedValueOnce(undefined)
    })

    it('should delegate to the adapter with normalized values', async () => {
      await component.logConnection('0xABC', '1.2.3.4')

      expect(mockIpModerationDb.logConnection).toHaveBeenCalledWith('0xabc', '1.2.3.4')
    })
  })

  describe('when getting IPs by address', () => {
    beforeEach(() => {
      mockIpModerationDb.getIpsByAddress.mockResolvedValueOnce(['1.2.3.4', '5.6.7.8'])
    })

    it('should return all IPs for the address with normalized address', async () => {
      const result = await component.getIpsByAddress('0xABC')

      expect(mockIpModerationDb.getIpsByAddress).toHaveBeenCalledWith('0xabc')
      expect(result).toEqual(['1.2.3.4', '5.6.7.8'])
    })
  })

  describe('when getting addresses by IP', () => {
    beforeEach(() => {
      mockIpModerationDb.getAddressesByIp.mockResolvedValueOnce(['0xabc', '0xdef'])
    })

    it('should return all addresses for the IP', async () => {
      const result = await component.getAddressesByIp('1.2.3.4')

      expect(mockIpModerationDb.getAddressesByIp).toHaveBeenCalledWith('1.2.3.4')
      expect(result).toEqual(['0xabc', '0xdef'])
    })
  })

  describe('when banning all IPs for an address', () => {
    describe('and the address has known IPs', () => {
      beforeEach(() => {
        mockIpModerationDb.getIpsByAddress.mockResolvedValueOnce(['1.2.3.4', '5.6.7.8'])
        mockIpModerationDb.getIpBanStatus.mockResolvedValue({ isBanned: false })
        mockIpModerationDb.banIp.mockResolvedValue(makeIpBan())
      })

      it('should ban each unbanned IP', async () => {
        await component.banAllIpsForAddress('0xABC', '0xADMIN', 'Violation')

        expect(mockIpModerationDb.banIp).toHaveBeenCalledTimes(2)
        expect(mockIpModerationDb.banIp).toHaveBeenCalledWith(
          expect.objectContaining({ bannedIp: '1.2.3.4', bannedBy: '0xadmin', reason: 'Violation' })
        )
        expect(mockIpModerationDb.banIp).toHaveBeenCalledWith(
          expect.objectContaining({ bannedIp: '5.6.7.8', bannedBy: '0xadmin', reason: 'Violation' })
        )
      })

      it('should skip IPs that are already banned', async () => {
        mockIpModerationDb.getIpBanStatus
          .mockResolvedValueOnce({ isBanned: true, ban: makeIpBan() })
          .mockResolvedValueOnce({ isBanned: false })

        await component.banAllIpsForAddress('0xABC', '0xADMIN', 'Violation')

        expect(mockIpModerationDb.banIp).toHaveBeenCalledTimes(1)
        expect(mockIpModerationDb.banIp).toHaveBeenCalledWith(
          expect.objectContaining({ bannedIp: '5.6.7.8' })
        )
      })
    })

    describe('and the address has no known IPs', () => {
      beforeEach(() => {
        mockIpModerationDb.getIpsByAddress.mockResolvedValueOnce([])
      })

      it('should not ban any IPs', async () => {
        await component.banAllIpsForAddress('0xABC', '0xADMIN', 'Violation')

        expect(mockIpModerationDb.banIp).not.toHaveBeenCalled()
      })
    })
  })

  describe('when banning all addresses for an IP', () => {
    describe('and the IP has known addresses', () => {
      beforeEach(() => {
        mockIpModerationDb.getAddressesByIp.mockResolvedValueOnce(['0xabc', '0xdef'])
        mockUserModeration.isPlayerBanned.mockResolvedValue({ isBanned: false })
        mockUserModeration.banPlayer.mockResolvedValue(makeBan())
      })

      it('should ban each unbanned address', async () => {
        await component.banAllAddressesForIp('1.2.3.4', '0xADMIN', 'Violation')

        expect(mockUserModeration.banPlayer).toHaveBeenCalledTimes(2)
        expect(mockUserModeration.banPlayer).toHaveBeenCalledWith('0xabc', '0xadmin', 'Violation')
        expect(mockUserModeration.banPlayer).toHaveBeenCalledWith('0xdef', '0xadmin', 'Violation')
      })

      it('should skip addresses that are already banned', async () => {
        mockUserModeration.isPlayerBanned
          .mockResolvedValueOnce({ isBanned: true, ban: makeBan() })
          .mockResolvedValueOnce({ isBanned: false })

        await component.banAllAddressesForIp('1.2.3.4', '0xADMIN', 'Violation')

        expect(mockUserModeration.banPlayer).toHaveBeenCalledTimes(1)
        expect(mockUserModeration.banPlayer).toHaveBeenCalledWith('0xdef', '0xadmin', 'Violation')
      })
    })

    describe('and the IP has no known addresses', () => {
      beforeEach(() => {
        mockIpModerationDb.getAddressesByIp.mockResolvedValueOnce([])
      })

      it('should not ban any addresses', async () => {
        await component.banAllAddressesForIp('1.2.3.4', '0xADMIN', 'Violation')

        expect(mockUserModeration.banPlayer).not.toHaveBeenCalled()
      })
    })
  })
})
