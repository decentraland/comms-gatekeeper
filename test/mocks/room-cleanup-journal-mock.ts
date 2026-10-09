import { IRoomCleanupJournalComponent } from '../../src/adapters/room-cleanup-journal'

export function createRoomCleanupJournalMockedComponent(
  overrides: Partial<jest.Mocked<IRoomCleanupJournalComponent>> = {}
): jest.Mocked<IRoomCleanupJournalComponent> {
  return {
    hasUnfinished: jest.fn().mockResolvedValue(false),
    get: jest.fn().mockResolvedValue(undefined),
    dispatch: jest.fn().mockResolvedValue(true),
    confirm: jest.fn().mockResolvedValue(undefined),
    cancelDefiniteFailure: jest.fn().mockResolvedValue(undefined),
    pruneConfirmed: jest.fn().mockResolvedValue(undefined),
    ...overrides
  }
}
