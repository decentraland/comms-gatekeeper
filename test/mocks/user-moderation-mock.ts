import { IUserModerationComponent } from '../../src/logic/user-moderation/types'

export const createUserModerationMockedComponent = (
  overrides?: Partial<jest.Mocked<IUserModerationComponent>>
): jest.Mocked<IUserModerationComponent> => {
  return {
    banPlayer: jest.fn(),
    liftBan: jest.fn().mockResolvedValue(undefined),
    warnPlayer: jest.fn(),
    isPlayerBanned: jest.fn().mockResolvedValue({ isBanned: false }),
    getActiveBanForConnection: jest.fn().mockResolvedValue({ isBanned: false }),
    getActiveBans: jest.fn().mockResolvedValue([]),
    getPlayerWarnings: jest.fn().mockResolvedValue([]),
    ...overrides
  } as unknown as jest.Mocked<IUserModerationComponent>
}
