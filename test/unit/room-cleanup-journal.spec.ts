import {
  createRoomCleanupJournalComponent,
  IRoomCleanupJournalComponent,
  CleanupDispatch
} from '../../src/adapters/room-cleanup-journal'
import { createDatabaseMockedComponent } from '../mocks/database-mock'
import { createConfigMockedComponent } from '../mocks/config-mock'

describe('when persisting room cleanup dispatches', () => {
  let database: ReturnType<typeof createDatabaseMockedComponent>
  let journal: IRoomCleanupJournalComponent
  let input: CleanupDispatch
  beforeEach(async () => {
    database = createDatabaseMockedComponent()
    input = { wallet: 'wallet', epoch: 'epoch', operationId: 'op', clusterId: 'room', revokeBefore: 123 }
    journal = await createRoomCleanupJournalComponent({
      database,
      config: createConfigMockedComponent({ getNumber: jest.fn().mockResolvedValue(2) })
    })
  })
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and capacity or existing work prevents insertion', () => {
    beforeEach(() => {
      database.query.mockResolvedValue({ rowCount: 0, rows: [] })
    })
    it('should refuse dispatch', async () => {
      await expect(journal.dispatch(input)).resolves.toBe(false)
    })
  })
  describe('and the database rejects persistence', () => {
    beforeEach(() => {
      database.query.mockRejectedValue(new Error('database unavailable'))
    })
    it('should propagate the error rather than authorize Cloud work', async () => {
      await expect(journal.dispatch(input)).rejects.toThrow('database unavailable')
    })
  })
  describe('and confirmation does not match the durable tuple', () => {
    beforeEach(() => {
      database.query.mockResolvedValue({ rowCount: 0, rows: [] })
    })
    it('should reject the purported success', async () => {
      await expect(journal.confirm(input)).rejects.toThrow('did not match')
    })
  })
  describe('and PostgreSQL returns a bigint cutoff', () => {
    beforeEach(() => {
      database.query.mockResolvedValue({ rows: [{ ...input, revokeBefore: '123', state: 'confirmed' }], rowCount: 1 })
    })
    it('should return its exact safe numeric value', async () => {
      await expect(journal.get('wallet', 'epoch', 'op')).resolves.toEqual({ ...input, state: 'confirmed' })
    })
  })
  describe('and stored cutoff exceeds safe precision', () => {
    beforeEach(() => {
      database.query.mockResolvedValue({
        rows: [{ ...input, revokeBefore: '9007199254740993', state: 'confirmed' }],
        rowCount: 1
      })
    })
    it('should block corrupt journal authority', async () => {
      await expect(journal.get('wallet', 'epoch', 'op')).rejects.toThrow('Invalid durable')
    })
  })
})
