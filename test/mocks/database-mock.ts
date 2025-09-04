import { IPgComponent } from '@well-known-components/pg-component'

export const createDatabaseMockedComponent = (
  overrides?: Partial<jest.Mocked<IPgComponent>>
): jest.Mocked<IPgComponent> => {
  return {
    getPool: overrides?.getPool ?? jest.fn(),
    start: overrides?.start ?? jest.fn(),
    streamQuery: overrides?.streamQuery ?? jest.fn(),
    stop: overrides?.stop ?? jest.fn(),
    query: overrides?.query ?? jest.fn()
  }
}
