import { IpBan } from '../../../src/logic/ip-moderation/types'

export const makeIpBan = (overrides: Partial<IpBan> = {}): IpBan => ({
  id: 'ip-ban-id',
  bannedIp: '1.2.3.4',
  bannedBy: '0xadmin',
  reason: 'Violation',
  customMessage: null,
  bannedAt: new Date('2025-01-01'),
  expiresAt: null,
  liftedAt: null,
  liftedBy: null,
  createdAt: new Date('2025-01-01'),
  ...overrides
})
