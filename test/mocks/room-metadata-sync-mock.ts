import { IRoomMetadataSyncComponent } from '../../src/logic/room-metadata-sync/types'

export function createRoomMetadataSyncMockedComponent(
  overrides?: Partial<jest.Mocked<IRoomMetadataSyncComponent>>
): jest.Mocked<IRoomMetadataSyncComponent> {
  return {
    refreshRoomMetadata: jest.fn(),
    updateRoomMetadataForRoom: jest.fn(),
    addBan: jest.fn(),
    removeBan: jest.fn(),
    addAdmin: jest.fn(),
    removeAdmin: jest.fn(),
    ...overrides
  }
}
