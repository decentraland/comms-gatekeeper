import { IHotScenesComponent } from '../../src/logic/hot-scenes'

export const createHotScenesMockedComponent = (
  overrides?: Partial<jest.Mocked<IHotScenesComponent>>
): jest.Mocked<IHotScenesComponent> => {
  return {
    getHotScenes: jest.fn().mockReturnValue([]),
    refresh: jest.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as jest.Mocked<IHotScenesComponent>
}
