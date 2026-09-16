import { IPlayerConnectionDBComponent } from '../../src/adapters/db/types'

export const createPlayerConnectionDBMockedComponent = (
  overrides?: Partial<jest.Mocked<IPlayerConnectionDBComponent>>
): jest.Mocked<IPlayerConnectionDBComponent> => {
  return {
    upsertPlayerConnection: jest.fn().mockResolvedValue(undefined),
    getByAddress: jest.fn().mockResolvedValue(null),
    ...overrides
  } as unknown as jest.Mocked<IPlayerConnectionDBComponent>
}
