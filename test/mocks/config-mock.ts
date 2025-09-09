import { IConfigComponent } from '@well-known-components/interfaces'

export const createConfigMockedComponent = (
  overrides?: Partial<jest.Mocked<IConfigComponent>>
): jest.Mocked<IConfigComponent> => {
  return {
    getString: jest.fn(),
    getNumber: jest.fn(),
    requireString: jest.fn(),
    requireNumber: jest.fn(),
    ...overrides
  }
}
