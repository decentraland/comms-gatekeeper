import { IAccessGateComponent } from '../../src/logic/access-gate'

export const createAccessGateMockedComponent = (
  overrides?: Partial<jest.Mocked<IAccessGateComponent>>
): jest.Mocked<IAccessGateComponent> => {
  return {
    getAccessState: jest.fn().mockResolvedValue({ isBanned: false, isDenylisted: false }),
    ...overrides
  } as unknown as jest.Mocked<IAccessGateComponent>
}
