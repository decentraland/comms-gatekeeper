import { IMetricsComponent } from '@well-known-components/interfaces'
import { metricDeclarations } from '../../src/metrics'

export const createMetricsMockedComponent = (
  overrides?: Partial<jest.Mocked<IMetricsComponent<keyof typeof metricDeclarations>>>
): jest.Mocked<IMetricsComponent<keyof typeof metricDeclarations>> => {
  return {
    increment: jest.fn(),
    decrement: jest.fn(),
    observe: jest.fn(),
    startTimer: jest.fn().mockReturnValue({ end: jest.fn() }),
    getValue: jest.fn(),
    resetAll: jest.fn(),
    ...overrides
  } as unknown as jest.Mocked<IMetricsComponent<keyof typeof metricDeclarations>>
}
