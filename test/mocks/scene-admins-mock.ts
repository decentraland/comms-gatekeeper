import { ISceneAdmins } from '../../src/types/scene.type'

export const createSceneAdminsMockedComponent = (
  overrides?: Partial<jest.Mocked<ISceneAdmins>>
): jest.Mocked<ISceneAdmins> => {
  return {
    getAdminsAndExtraAddresses: jest.fn().mockResolvedValue({
      admins: new Set(),
      extraAddresses: new Set(),
      addresses: new Set()
    }),
    start: jest.fn(),
    stop: jest.fn(),
    ...overrides
  } as jest.Mocked<ISceneAdmins>
}
