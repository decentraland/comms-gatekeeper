import { IPublisherComponent } from '@dcl/sns-component'

export const createPublisherMockedComponent = (
  overrides?: Partial<jest.Mocked<IPublisherComponent>>
): jest.Mocked<IPublisherComponent> => {
  return {
    publishMessages: jest.fn(),
    publishMessage: jest.fn(),
    ...overrides
  }
}
