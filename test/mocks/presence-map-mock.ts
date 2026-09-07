import { IPresenceMapComponent } from '../../src/logic/presence-map'

export const createPresenceMapMockedComponent = (
  overrides?: Partial<jest.Mocked<IPresenceMapComponent>>
): jest.Mocked<IPresenceMapComponent> => {
  return {
    isReady: jest.fn().mockReturnValue(true),
    size: jest.fn().mockReturnValue(0),
    applyBatch: jest.fn(),
    get: jest.fn(),
    getAddressesInRealm: jest.fn().mockReturnValue([]),
    getAddressesInParcels: jest.fn().mockReturnValue([]),
    getParcelCounts: jest.fn().mockReturnValue([]),
    ...overrides
  } as unknown as jest.Mocked<IPresenceMapComponent>
}
