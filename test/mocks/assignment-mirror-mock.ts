import { IAssignmentMirrorComponent } from '../../src/adapters/assignment-mirror'

export const createAssignmentMirrorMockedComponent = (
  overrides?: Partial<jest.Mocked<IAssignmentMirrorComponent>>
): jest.Mocked<IAssignmentMirrorComponent> => {
  // Backed by a plain Map so tests that care about read-your-writes get it for free, while
  // still being able to override `get`/`set` to assert on the interaction.
  const store = new Map<string, string>()

  return {
    get: jest.fn().mockImplementation((wallet: string) => store.get(wallet)),
    set: jest.fn().mockImplementation((wallet: string, clusterId: string) => {
      store.set(wallet, clusterId)
    }),
    size: jest.fn().mockImplementation(() => store.size),
    ...overrides
  } as unknown as jest.Mocked<IAssignmentMirrorComponent>
}
