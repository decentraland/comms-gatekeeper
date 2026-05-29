export interface IpBan {
  id: string
  bannedIp: string
  bannedBy: string
  reason: string
  customMessage: string | null
  bannedAt: Date
  expiresAt: Date | null
  liftedAt: Date | null
  liftedBy: string | null
  createdAt: Date
}

export interface ConnectionLog {
  ip: string
  connectedAt: Date
}

export type IpBanStatus = { isBanned: boolean; ban?: IpBan }

export type CreateIpBanInput = {
  bannedIp: string
  bannedBy: string
  reason: string
  customMessage?: string
  expiresAt?: Date
}

export interface IIpModerationDatabaseComponent {
  banIp(input: CreateIpBanInput): Promise<IpBan>
  liftIpBan(ip: string, liftedBy: string): Promise<IpBan | null>
  getIpBanStatus(ip: string): Promise<IpBanStatus>
  logConnection(address: string, ip: string): Promise<void>
  getIpsByAddress(address: string): Promise<string[]>
  getAddressesByIp(ip: string): Promise<string[]>
  getConnectionLogsByAddress(address: string): Promise<ConnectionLog[]>
  deleteConnectionLogsByAddress(address: string): Promise<number>
  purgeExpiredConnectionLogs(retentionDays: number): Promise<number>
}
