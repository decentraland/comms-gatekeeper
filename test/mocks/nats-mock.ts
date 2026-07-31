import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { INatsComponent } from '../../src/adapters/nats'

export const createNatsMockedComponent = (
  overrides?: Partial<jest.Mocked<INatsComponent>>
): jest.Mocked<INatsComponent> => {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
    // Defaults to a delivered publish; override with `false` to exercise the dropped path.
    publish: jest.fn().mockReturnValue(true),
    isEnabled: jest.fn().mockReturnValue(true),
    isConnected: jest.fn().mockReturnValue(true),
    [STOP_COMPONENT]: jest.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as jest.Mocked<INatsComponent>
}
