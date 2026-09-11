import { IAssignmentMirrorComponent, MirrorEntry } from '../../src/adapters/assignment-mirror'

export const createAssignmentMirrorMockedComponent = (
  overrides?: Partial<jest.Mocked<IAssignmentMirrorComponent>>
): jest.Mocked<IAssignmentMirrorComponent> => {
  // Backed by a plain Map so tests that care about read-your-writes get it for free, while
  // still being able to override `get`/`set` to assert on the interaction.
  const store = new Map<string, MirrorEntry>()

  return {
    get: jest.fn().mockImplementation((wallet: string) => store.get(wallet)),
    set: jest.fn().mockImplementation((wallet: string, entry: MirrorEntry) => {
      store.set(wallet, entry)
    }),
    size: jest.fn().mockImplementation(() => store.size),
    ...overrides
  } as unknown as jest.Mocked<IAssignmentMirrorComponent>
}
