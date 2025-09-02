import { ICachedFetchComponent } from '../../src/types/fetch.type'

export const createCachedFetchMockedComponent = (
  overrides?: Partial<jest.Mocked<Pick<ReturnType<ICachedFetchComponent['cache']>, 'fetch'>>>
): jest.Mocked<ICachedFetchComponent> => {
  return {
    cache: jest.fn().mockImplementation(() => ({
      fetch: jest.fn(),
      ...overrides
    }))
  } as jest.Mocked<ICachedFetchComponent>
}
