import { IpBan, IpBanStatus, ConnectionLog, IIpModerationDatabaseComponent } from './types'
import { IpAlreadyBannedError, IpBanNotFoundError } from './errors'
import { IUserModerationComponent } from '../user-moderation/types'
import { ILoggerComponent } from '@well-known-components/interfaces'

export interface IIpModerationComponent {
  banIp(ip: string, bannedBy: string, reason: string, duration?: number, customMessage?: string): Promise<IpBan>
  liftIpBan(ip: string, liftedBy: string): Promise<void>
  getIpBanStatus(ip: string): Promise<IpBanStatus>
  logConnection(address: string, ip: string): Promise<void>
  getIpsByAddress(address: string): Promise<string[]>
  getAddressesByIp(ip: string): Promise<string[]>
  banAllIpsForAddress(address: string, bannedBy: string, reason: string): Promise<void>
  banAllAddressesForIp(ip: string, bannedBy: string, reason: string): Promise<void>
  getConnectionLogsByAddress(address: string): Promise<ConnectionLog[]>
  deleteConnectionLogsByAddress(address: string): Promise<number>
  purgeExpiredConnectionLogs(retentionDays: number): Promise<number>
}

function normalizeIp(ip: string): string {
  return ip.toLowerCase()
}

function normalizeAddress(address: string): string {
  return address.toLowerCase()
}

export function createIpModerationComponent(components: {
  ipModerationDb: IIpModerationDatabaseComponent
  userModeration: IUserModerationComponent
  logs: ILoggerComponent
}): IIpModerationComponent {
  const { ipModerationDb, userModeration, logs } = components
  const logger = logs.getLogger('ip-moderation')

  return {
    async banIp(
      ip: string,
      bannedBy: string,
      reason: string,
      duration?: number,
      customMessage?: string
    ): Promise<IpBan> {
      const normalizedIp = normalizeIp(ip)
      const normalizedBannedBy = normalizeAddress(bannedBy)

      const { isBanned } = await ipModerationDb.getIpBanStatus(normalizedIp)
      if (isBanned) {
        throw new IpAlreadyBannedError(normalizedIp)
      }

      const expiresAt = duration ? new Date(Date.now() + duration) : undefined

      logger.info(`Banning IP ${normalizedIp} by ${normalizedBannedBy}`)

      return ipModerationDb.banIp({
        bannedIp: normalizedIp,
        bannedBy: normalizedBannedBy,
        reason,
        customMessage,
        expiresAt
      })
    },

    async liftIpBan(ip: string, liftedBy: string): Promise<void> {
      const normalizedIp = normalizeIp(ip)
      const normalizedLiftedBy = normalizeAddress(liftedBy)

      logger.info(`Lifting IP ban for ${normalizedIp} by ${normalizedLiftedBy}`)

      const ban = await ipModerationDb.liftIpBan(normalizedIp, normalizedLiftedBy)
      if (!ban) {
        throw new IpBanNotFoundError(normalizedIp)
      }
    },

    async getIpBanStatus(ip: string): Promise<IpBanStatus> {
      const normalizedIp = normalizeIp(ip)
      return ipModerationDb.getIpBanStatus(normalizedIp)
    },

    async logConnection(address: string, ip: string): Promise<void> {
      const normalizedAddress = normalizeAddress(address)
      const normalizedIp = normalizeIp(ip)
      return ipModerationDb.logConnection(normalizedAddress, normalizedIp)
    },

    async getIpsByAddress(address: string): Promise<string[]> {
      const normalizedAddress = normalizeAddress(address)
      return ipModerationDb.getIpsByAddress(normalizedAddress)
    },

    async getAddressesByIp(ip: string): Promise<string[]> {
      const normalizedIp = normalizeIp(ip)
      return ipModerationDb.getAddressesByIp(normalizedIp)
    },

    async banAllIpsForAddress(address: string, bannedBy: string, reason: string): Promise<void> {
      const normalizedAddress = normalizeAddress(address)
      const normalizedBannedBy = normalizeAddress(bannedBy)

      const ips = await ipModerationDb.getIpsByAddress(normalizedAddress)
      if (ips.length === 0) {
        return
      }

      logger.info(`Banning ${ips.length} IPs for address ${normalizedAddress} by ${normalizedBannedBy}`)

      for (const ip of ips) {
        const { isBanned } = await ipModerationDb.getIpBanStatus(ip)
        if (!isBanned) {
          await ipModerationDb.banIp({ bannedIp: ip, bannedBy: normalizedBannedBy, reason })
        }
      }
    },

    async banAllAddressesForIp(ip: string, bannedBy: string, reason: string): Promise<void> {
      const normalizedIp = normalizeIp(ip)
      const normalizedBannedBy = normalizeAddress(bannedBy)

      const addresses = await ipModerationDb.getAddressesByIp(normalizedIp)
      if (addresses.length === 0) {
        return
      }

      logger.info(`Banning ${addresses.length} addresses for IP ${normalizedIp} by ${normalizedBannedBy}`)

      for (const address of addresses) {
        const { isBanned } = await userModeration.isPlayerBanned(address)
        if (!isBanned) {
          await userModeration.banPlayer(address, normalizedBannedBy, reason)
        }
      }
    },

    async getConnectionLogsByAddress(address: string): Promise<ConnectionLog[]> {
      const normalizedAddress = normalizeAddress(address)
      return ipModerationDb.getConnectionLogsByAddress(normalizedAddress)
    },

    async deleteConnectionLogsByAddress(address: string): Promise<number> {
      const normalizedAddress = normalizeAddress(address)
      logger.info(`Deleting connection logs for address ${normalizedAddress} (GDPR erasure request)`)
      return ipModerationDb.deleteConnectionLogsByAddress(normalizedAddress)
    },

    async purgeExpiredConnectionLogs(retentionDays: number): Promise<number> {
      const count = await ipModerationDb.purgeExpiredConnectionLogs(retentionDays)
      if (count > 0) {
        logger.info(`Purged ${count} expired connection logs (retention: ${retentionDays} days)`)
      }
      return count
    }
  }
}
