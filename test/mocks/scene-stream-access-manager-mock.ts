import { ISceneStreamAccessManager } from '../../src/types'

export const createSceneStreamAccessManagerMockedComponent = (
  overrides?: Partial<jest.Mocked<ISceneStreamAccessManager>>
): jest.Mocked<ISceneStreamAccessManager> => {
  return {
    addAccess: jest.fn(),
    removeAccess: jest.fn(),
    removeAccessByPlaceIds: jest.fn(),
    getAccess: jest.fn(),
    getAccessByStreamingKey: jest.fn(), // Add missing method
    getExpiredStreamingKeys: jest.fn(),
    startStreaming: jest.fn(),
    stopStreaming: jest.fn(),
    isStreaming: jest.fn(),
    getExpiredStreamAccesses: jest.fn(),
    killStreaming: jest.fn(),
    ...overrides
  }
}
