import { IWorldComponent } from '../../src/types/worlds.type'

export const createWorldsMockedComponent = (
  overrides: Partial<jest.Mocked<IWorldComponent>> = {}
): jest.Mocked<IWorldComponent> => ({
  resolveWorldScene: jest.fn(),
  resolveWorldSceneId: jest.fn(),
  fetchWorldSceneByEntityId: jest.fn(),
  fetchWorldActionPermissions: jest.fn(),
  fetchWorldSceneByPointer: jest.fn(),
  fetchWorldSceneEntityMetadataById: jest.fn(),
  fetchWorldSceneId: jest.fn(),
  hasWorldOwnerPermission: jest.fn(),
  hasWorldStreamingPermission: jest.fn(),
  hasWorldDeployPermission: jest.fn(),
  hasWorldAccessPermission: jest.fn(),
  getWorldParcelPermissions: jest.fn(),
  getWorldParcelPermissionAddresses: jest.fn(),
  ...overrides
})
