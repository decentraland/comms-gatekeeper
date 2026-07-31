import { INatsComponent } from '../../src/types/nats.type'

export const createNatsMockedComponent = (
  overrides?: Partial<jest.Mocked<INatsComponent>>
): jest.Mocked<INatsComponent> => {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
    publish: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    stop: jest.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as jest.Mocked<INatsComponent>
}
