import { Events, UserBanCreatedEvent, UserBanLiftedEvent, UserWarningCreatedEvent } from '@dcl/schemas'
import { UserBan, UserWarning } from './types'

export function createBanEvent(ban: UserBan): UserBanCreatedEvent {
  return {
    type: Events.Type.MODERATION,
    subType: Events.SubType.Moderation.USER_BAN_CREATED,
    key: ban.id,
    timestamp: Date.now(),
    metadata: {
      id: ban.id,
      bannedAddress: ban.bannedAddress,
      bannedBy: ban.bannedBy,
      reason: ban.reason,
      bannedAt: ban.bannedAt.getTime(),
      expiresAt: ban.expiresAt ? ban.expiresAt.getTime() : null,
      ...(ban.customMessage ? { customMessage: ban.customMessage } : {})
    }
  }
}

export function createBanLiftedEvent(ban: UserBan): UserBanLiftedEvent {
  if (!ban.liftedBy || !ban.liftedAt) {
    throw new Error(`Ban ${ban.id} is not lifted`)
  }

  return {
    type: Events.Type.MODERATION,
    subType: Events.SubType.Moderation.USER_BAN_LIFTED,
    key: ban.id,
    timestamp: Date.now(),
    metadata: {
      id: ban.id,
      bannedAddress: ban.bannedAddress,
      liftedBy: ban.liftedBy,
      liftedAt: ban.liftedAt.getTime()
    }
  }
}

export function createWarningEvent(warning: UserWarning): UserWarningCreatedEvent {
  return {
    type: Events.Type.MODERATION,
    subType: Events.SubType.Moderation.USER_WARNING_CREATED,
    key: warning.id,
    timestamp: Date.now(),
    metadata: {
      id: warning.id,
      warnedAddress: warning.warnedAddress,
      warnedBy: warning.warnedBy,
      reason: warning.reason,
      warnedAt: warning.warnedAt.getTime()
    }
  }
}
