import { IPublisherComponent } from '../../src/types'

export const createPublisherMockedComponent = (
  overrides?: Partial<jest.Mocked<IPublisherComponent>>
): jest.Mocked<IPublisherComponent> => {
  return {
    publishMessages: jest.fn(),
    ...overrides
  }
}
