import { IContentClientComponent } from '../../src/types/content-client.type'

export const createContentClientMockedComponent = (
  overrides?: Partial<IContentClientComponent>
): jest.Mocked<IContentClientComponent> => {
  return {
    fetchEntityById: jest.fn(),
    fetchEntitiesByPointers: jest.fn(),
    ...overrides
  } as jest.Mocked<IContentClientComponent>
}
