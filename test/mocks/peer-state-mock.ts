import { IPeerStateComponent, PeerAssignment } from '../../src/adapters/peer-state'

export const createPeerStateMockedComponent = (
  overrides?: Partial<jest.Mocked<IPeerStateComponent>>
): jest.Mocked<IPeerStateComponent> => {
  // Backed by a plain Map so tests that care about read-your-writes get it for free, while
  // still being able to override `get`/`set` to assert on the interaction.
  const store = new Map<string, PeerAssignment>()

  return {
    get: jest.fn().mockImplementation((wallet: string) => store.get(wallet)),
    set: jest.fn().mockImplementation((wallet: string, assignment: PeerAssignment) => {
      store.set(wallet, assignment)
    }),
    size: jest.fn().mockImplementation(() => store.size),
    ...overrides
  } as unknown as jest.Mocked<IPeerStateComponent>
}
