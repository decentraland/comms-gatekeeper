import { ISceneAdminManager } from '../../src/types'

export const createSceneAdminManagerMockedComponent = (
  overrides?: Partial<jest.Mocked<ISceneAdminManager>>
): jest.Mocked<ISceneAdminManager> => {
  return {
    addAdmin: jest.fn(),
    removeAdmin: jest.fn(),
    listActiveAdmins: jest.fn(),
    isAdmin: jest.fn().mockResolvedValue(false),
    getPlacesIdWithActiveAdmins: jest.fn(),
    removeAllAdminsByPlaceIds: jest.fn(),
    ...overrides
  }
}
