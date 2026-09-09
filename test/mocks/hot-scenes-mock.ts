import { IHotScenesComponent } from '../../src/logic/hot-scenes'

export const createHotScenesMockedComponent = (
  overrides?: Partial<jest.Mocked<IHotScenesComponent>>
): jest.Mocked<IHotScenesComponent> => {
  return {
    isReady: jest.fn().mockReturnValue(true),
    getHotScenes: jest.fn().mockReturnValue([]),
    refresh: jest.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as jest.Mocked<IHotScenesComponent>
}
