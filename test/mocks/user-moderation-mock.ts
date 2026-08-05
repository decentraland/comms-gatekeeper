import { IUserModerationComponent } from '../../src/logic/user-moderation/types'

export const createUserModerationMockedComponent = (
  overrides?: Partial<jest.Mocked<IUserModerationComponent>>
): jest.Mocked<IUserModerationComponent> => {
  return {
    banPlayer: jest.fn(),
    liftBan: jest.fn(),
    warnPlayer: jest.fn(),
    isPlayerBanned: jest.fn().mockResolvedValue({ isBanned: false }),
    // Defaults to not banned so specs that are not about ban enforcement do not have to
    // stub the gate every credential-issuing path now consults.
    getActiveBanForConnection: jest.fn().mockResolvedValue({ isBanned: false }),
    getActiveBans: jest.fn().mockResolvedValue([]),
    getPlayerWarnings: jest.fn().mockResolvedValue([]),
    ...overrides
  }
}
