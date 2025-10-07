import { ISceneBansComponent } from '../../src/logic/scene-bans/types'

export function createSceneBansMockedComponent(
  overrides?: Partial<jest.Mocked<ISceneBansComponent>>
): jest.Mocked<ISceneBansComponent> {
  return {
    addSceneBan: jest.fn(),
    addSceneBanByName: jest.fn(),
    removeSceneBan: jest.fn(),
    removeSceneBanByName: jest.fn(),
    listSceneBans: jest.fn(),
    listSceneBannedAddresses: jest.fn(),
    isUserBanned: jest.fn(),
    removeBansFromDisabledPlaces: jest.fn(),
    updateRoomMetadataWithBans: jest.fn(),
    ...overrides
  }
}
