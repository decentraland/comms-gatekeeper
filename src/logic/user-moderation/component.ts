import { IUserModerationComponent, UserBan, UserWarning, BanStatus, UserModerationEvent } from './types'
import { PlayerAlreadyBannedError, BanNotFoundError } from './errors'
import { createBanEvent, createBanLiftedEvent, createWarningEvent } from './events'
import { AppComponents } from '../../types'
import { retry } from '../../utils/retrier'

function normalizeAddress(address: string): string {
  return address.toLowerCase()
}

export function createUserModerationComponent(
  components: Pick<AppComponents, 'userModerationDb' | 'logs' | 'publisher'>
): IUserModerationComponent {
  const { userModerationDb, logs, publisher } = components
  const logger = logs.getLogger('user-moderation')

  async function publishModerationEvent(event: UserModerationEvent): Promise<void> {
    try {
      await retry(async () => {
        await publisher.publishMessage(event)
      })
    } catch (error: any) {
      logger.error('Failed to publish moderation event', {
        error: error.message,
        subType: event.subType,
        key: event.key
      })
    }
  }

  return {
    async banPlayer(
      address: string,
      bannedBy: string,
      reason: string,
      duration?: number,
      customMessage?: string
    ): Promise<UserBan> {
      const normalizedAddress = normalizeAddress(address)
      const normalizedBannedBy = normalizeAddress(bannedBy)

      const { isBanned } = await userModerationDb.isPlayerBanned(normalizedAddress)
      if (isBanned) {
        throw new PlayerAlreadyBannedError(normalizedAddress)
      }

      const expiresAt = duration ? new Date(Date.now() + duration) : undefined

      logger.info(`Banning player ${normalizedAddress} by ${normalizedBannedBy}`)

      const ban = await userModerationDb.createBan({
        bannedAddress: normalizedAddress,
        bannedBy: normalizedBannedBy,
        reason,
        customMessage,
        expiresAt
      })

      void publishModerationEvent(createBanEvent(ban))

      return ban
    },

    async liftBan(address: string, liftedBy: string): Promise<void> {
      const normalizedAddress = normalizeAddress(address)
      const normalizedLiftedBy = normalizeAddress(liftedBy)

      logger.info(`Lifting ban for player ${normalizedAddress} by ${normalizedLiftedBy}`)

      const ban = await userModerationDb.liftBan(normalizedAddress, normalizedLiftedBy)
      if (!ban) {
        throw new BanNotFoundError(normalizedAddress)
      }

      void publishModerationEvent(createBanLiftedEvent(ban))
    },

    async warnPlayer(address: string, reason: string, warnedBy: string): Promise<UserWarning> {
      const normalizedAddress = normalizeAddress(address)
      const normalizedWarnedBy = normalizeAddress(warnedBy)

      logger.info(`Warning player ${normalizedAddress} by ${normalizedWarnedBy}`)

      const warning = await userModerationDb.createWarning({
        warnedAddress: normalizedAddress,
        warnedBy: normalizedWarnedBy,
        reason
      })

      void publishModerationEvent(createWarningEvent(warning))

      return warning
    },

    async isPlayerBanned(address: string): Promise<BanStatus> {
      const normalizedAddress = normalizeAddress(address)
      return userModerationDb.isPlayerBanned(normalizedAddress)
    },

    async getActiveBans(): Promise<UserBan[]> {
      return userModerationDb.getActiveBans()
    },

    async getPlayerWarnings(address: string): Promise<UserWarning[]> {
      const normalizedAddress = normalizeAddress(address)
      return userModerationDb.getPlayerWarnings(normalizedAddress)
    }
  }
}
