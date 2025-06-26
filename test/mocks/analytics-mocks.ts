import { IAnalyticsComponent } from '@dcl/analytics-component'
import { AnalyticsEventPayload } from '../../src/types/analytics'

export const createAnalyticsMockedComponent = (
  overrides?: Partial<IAnalyticsComponent<AnalyticsEventPayload>>
): jest.Mocked<IAnalyticsComponent<AnalyticsEventPayload>> => {
  return {
    fireEvent: jest.fn(),
    sendEvent: jest.fn(),
    ...overrides
  } as jest.Mocked<IAnalyticsComponent<AnalyticsEventPayload>>
}
