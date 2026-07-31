import { IDenyListComponent } from '../../src/adapters/denylist'

export const createDenyListMockedComponent = (
  overrides?: Partial<jest.Mocked<IDenyListComponent>>
): jest.Mocked<IDenyListComponent> => {
  return {
    isDenylisted: jest.fn().mockResolvedValue(false),
    ...overrides
  } as unknown as jest.Mocked<IDenyListComponent>
}
