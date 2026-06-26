import { UserBanCreatedEvent, UserBanLiftedEvent, UserWarningCreatedEvent } from '@dcl/schemas'

export interface UserBan {
  id: string
  bannedAddress: string
  bannedBy: string
  reason: string
  customMessage: string | null
  // Device id / IP captured from the player's connection info at ban time, used to reject
  // a banned player who reconnects under a different wallet. Null when unavailable or, for
  // the IP, when the moderator did not opt in.
  bannedDeviceId: string | null
  bannedIp: string | null
  bannedAt: Date
  expiresAt: Date | null
  liftedAt: Date | null
  liftedBy: string | null
  createdAt: Date
}

export interface UserWarning {
  id: string
  warnedAddress: string
  warnedBy: string
  reason: string
  warnedAt: Date
  createdAt: Date
}

export type BanStatus = { isBanned: boolean; ban?: UserBan }

export type CreateBanInput = {
  bannedAddress: string
  bannedBy: string
  reason: string
  customMessage?: string
  bannedDeviceId?: string | null
  bannedIp?: string | null
  expiresAt?: Date
}

export type ConnectionBanQuery = {
  address: string
  deviceId?: string | null
  ip?: string | null
}

export type CreateWarningInput = {
  warnedAddress: string
  warnedBy: string
  reason: string
}

export interface IUserModerationComponent {
  banPlayer(
    address: string,
    bannedBy: string,
    reason: string,
    duration?: number,
    customMessage?: string,
    banIp?: boolean
  ): Promise<UserBan>
  liftBan(address: string, liftedBy: string): Promise<void>
  warnPlayer(address: string, reason: string, warnedBy: string): Promise<UserWarning>
  isPlayerBanned(address: string): Promise<BanStatus>
  getActiveBanForConnection(query: ConnectionBanQuery): Promise<BanStatus>
  getActiveBans(): Promise<UserBan[]>
  getPlayerWarnings(address: string): Promise<UserWarning[]>
}

export interface IUserModerationDatabaseComponent {
  createBan(input: CreateBanInput): Promise<UserBan>
  liftBan(address: string, liftedBy: string): Promise<UserBan | null>
  isPlayerBanned(address: string): Promise<BanStatus>
  getActiveBanForConnection(query: ConnectionBanQuery): Promise<BanStatus>
  getActiveBans(): Promise<UserBan[]>
  createWarning(input: CreateWarningInput): Promise<UserWarning>
  getPlayerWarnings(address: string): Promise<UserWarning[]>
  getBanHistory(address: string): Promise<UserBan[]>
}

export type UserModerationEvent = UserBanCreatedEvent | UserBanLiftedEvent | UserWarningCreatedEvent
