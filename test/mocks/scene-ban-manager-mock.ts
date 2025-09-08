import { ISceneBanManager } from '../../src/types'

export const createSceneBanManagerMockedComponent = (
  overrides?: Partial<jest.Mocked<ISceneBanManager>>
): jest.Mocked<ISceneBanManager> => {
  return {
    addBan: jest.fn(),
    removeBan: jest.fn(),
    countBannedAddresses: jest.fn(),
    listBannedAddresses: jest.fn(),
    ...overrides
  }
}
