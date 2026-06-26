import {
  IUserModerationComponent,
  UserBan,
  UserWarning,
  BanStatus,
  ConnectionBanQuery,
  UserModerationEvent
} from './types'
import { PlayerAlreadyBannedError, BanNotFoundError } from './errors'
import { createBanEvent, createBanLiftedEvent, createWarningEvent } from './events'
import { AppComponents } from '../../types'
import { retry } from '../../utils/retrier'

function normalizeAddress(address: string): string {
  return address.toLowerCase()
}

export function createUserModerationComponent(
  components: Pick<AppComponents, 'userModerationDb' | 'playerConnectionDb' | 'logs' | 'publisher' | 'livekit'>
): IUserModerationComponent {
  const { userModerationDb, playerConnectionDb, logs, publisher, livekit } = components
  const logger = logs.getLogger('user-moderation')

  async function removeParticipantFromAllRooms(address: string): Promise<void> {
    try {
      await livekit.removeParticipantFromAllRooms(address)
    } catch (error: any) {
      logger.error('Failed to remove participant from all rooms', {
        error: error.message,
        address
      })
    }
  }

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

      // Snapshot the player's recorded device id so the ban also covers reconnections from the
      // same device under a different wallet. Best-effort: a player with no recorded connection
      // info is banned by address only. Empty strings are treated as absent.
      let bannedDeviceId: string | null = null
      try {
        const connectionInfo = await playerConnectionDb.getByAddress(normalizedAddress)
        bannedDeviceId = connectionInfo?.deviceId || null
      } catch (error: any) {
        logger.warn(`Failed to load connection info for ${normalizedAddress}: ${error.message}`)
      }

      logger.info(`Banning player ${normalizedAddress} by ${normalizedBannedBy}`)

      const ban = await userModerationDb.createBan({
        bannedAddress: normalizedAddress,
        bannedBy: normalizedBannedBy,
        reason,
        customMessage,
        bannedDeviceId,
        expiresAt
      })

      void publishModerationEvent(createBanEvent(ban))
      void removeParticipantFromAllRooms(normalizedAddress)

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

    async getActiveBanForConnection({ address, deviceId }: ConnectionBanQuery): Promise<BanStatus> {
      return userModerationDb.getActiveBanForConnection({ address: normalizeAddress(address), deviceId })
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
