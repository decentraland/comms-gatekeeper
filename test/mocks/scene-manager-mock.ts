import { ISceneManager } from '../../src/types/scene-manager.type'

export const createSceneManagerMockedComponent = (
  overrides?: Partial<jest.Mocked<ISceneManager>>
): jest.Mocked<ISceneManager> => {
  return {
    isSceneOwner: jest.fn(),
    isSceneOwnerOrAdmin: jest.fn(),
    getUserScenePermissions: jest.fn(),
    ...overrides
  }
}
