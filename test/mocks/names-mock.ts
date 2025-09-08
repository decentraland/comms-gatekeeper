import { INamesComponent } from '../../src/types/names.type'

export const createNamesMockedComponent = (overrides?: Partial<INamesComponent>): jest.Mocked<INamesComponent> => {
  return {
    getNamesFromAddresses: jest.fn(),
    ...overrides
  } as jest.Mocked<INamesComponent>
}
