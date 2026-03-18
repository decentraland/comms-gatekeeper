import { Events } from '@dcl/schemas'
import { createBanEvent, createBanLiftedEvent, createWarningEvent } from '../../../src/logic/user-moderation/events'
import { makeBan, makeWarning } from './utils'

describe('user-moderation events', () => {
  describe('when creating a ban event', () => {
    describe('and it does not have an expiration or custom message', () => {
      it('should return the correct event shape', () => {
        const ban = makeBan()
        expect(createBanEvent(ban)).toEqual({
          type: Events.Type.MODERATION,
          subType: Events.SubType.Moderation.USER_BAN_CREATED,
          key: ban.id,
          timestamp: expect.any(Number),
          metadata: {
            id: ban.id,
            bannedAddress: ban.bannedAddress,
            bannedBy: ban.bannedBy,
            reason: ban.reason,
            bannedAt: ban.bannedAt.getTime(),
            expiresAt: null
          }
        })
      })
    })

    describe('and it has an expiration date', () => {
      it('should include expiresAt as a unix timestamp in the metadata', () => {
        const ban = makeBan({ expiresAt: new Date('2025-12-31T00:00:00.000Z') })
        expect(createBanEvent(ban)).toEqual({
          type: Events.Type.MODERATION,
          subType: Events.SubType.Moderation.USER_BAN_CREATED,
          key: ban.id,
          timestamp: expect.any(Number),
          metadata: {
            id: ban.id,
            bannedAddress: ban.bannedAddress,
            bannedBy: ban.bannedBy,
            reason: ban.reason,
            bannedAt: ban.bannedAt.getTime(),
            expiresAt: ban.expiresAt!.getTime()
          }
        })
      })
    })

    describe('and it has a custom message', () => {
      it('should include customMessage in the metadata', () => {
        const ban = makeBan({ customMessage: 'You have been banned for misconduct' })
        expect(createBanEvent(ban)).toEqual({
          type: Events.Type.MODERATION,
          subType: Events.SubType.Moderation.USER_BAN_CREATED,
          key: ban.id,
          timestamp: expect.any(Number),
          metadata: {
            id: ban.id,
            bannedAddress: ban.bannedAddress,
            bannedBy: ban.bannedBy,
            reason: ban.reason,
            bannedAt: ban.bannedAt.getTime(),
            expiresAt: null,
            customMessage: 'You have been banned for misconduct'
          }
        })
      })
    })
  })

  describe('when creating a warning event', () => {
    it('should return the correct event shape', () => {
      const warning = makeWarning()
      expect(createWarningEvent(warning)).toEqual({
        type: Events.Type.MODERATION,
        subType: Events.SubType.Moderation.USER_WARNING_CREATED,
        key: warning.id,
        timestamp: expect.any(Number),
        metadata: {
          id: warning.id,
          warnedAddress: warning.warnedAddress,
          warnedBy: warning.warnedBy,
          reason: warning.reason,
          warnedAt: warning.warnedAt.getTime()
        }
      })
    })
  })

  describe('when creating a ban lifted event', () => {
    describe('and the ban has not been lifted', () => {
      it('should throw an error', () => {
        expect(() => createBanLiftedEvent(makeBan())).toThrow('Ban ban-id is not lifted')
      })
    })

    describe('and the ban has been lifted', () => {
      it('should return the correct event shape', () => {
        const ban = makeBan({ liftedAt: new Date('2025-06-01'), liftedBy: '0xmoderator' })
        expect(createBanLiftedEvent(ban)).toEqual({
          type: Events.Type.MODERATION,
          subType: Events.SubType.Moderation.USER_BAN_LIFTED,
          key: ban.id,
          timestamp: expect.any(Number),
          metadata: {
            id: ban.id,
            bannedAddress: ban.bannedAddress,
            liftedBy: ban.liftedBy,
            liftedAt: ban.liftedAt!.getTime()
          }
        })
      })
    })
  })
})
