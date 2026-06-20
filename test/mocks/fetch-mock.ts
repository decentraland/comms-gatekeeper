import { IFetchComponent } from '@dcl/core-commons'

export const createFetchMockedComponent = (
  overrides?: Partial<jest.Mocked<IFetchComponent>>
): jest.Mocked<IFetchComponent> => {
  return {
    fetch: jest.fn(),
    ...overrides
  }
}
