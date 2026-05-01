import { ILandComponent } from '../../src/adapters/lands'

export const createLandsMockedComponent = (
  overrides?: Partial<jest.Mocked<ILandComponent>>
): jest.Mocked<ILandComponent> => {
  return {
    getLandPermissions: jest.fn(),
    getLandOperators: jest.fn(),
    hasLandLease: jest.fn(),
    getLeaseHoldersForParcels: jest.fn().mockResolvedValue([]),
    getAuthorizations: jest.fn().mockResolvedValue({ authorizations: [] }),
    refreshAuthorizations: jest.fn(),
    ...overrides
  } as jest.Mocked<ILandComponent>
}
