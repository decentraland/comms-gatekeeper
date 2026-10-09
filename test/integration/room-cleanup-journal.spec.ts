import { test } from '../components'
import {
  createRoomCleanupJournalComponent,
  IRoomCleanupJournalComponent,
  CleanupDispatch
} from '../../src/adapters/room-cleanup-journal'
import { createConfigMockedComponent } from '../mocks/config-mock'

test('durable room cleanup journal', ({ components }) => {
  let journal: IRoomCleanupJournalComponent
  let input: CleanupDispatch
  beforeEach(async () => {
    await components.database.query('DELETE FROM room_cleanup_dispatches')
    input = {
      wallet: '0x1111111111111111111111111111111111111111',
      epoch: 'epoch-a',
      operationId: 'op-a',
      clusterId: 'room-a',
      revokeBefore: 123
    }
    journal = await createRoomCleanupJournalComponent({
      database: components.database,
      config: createConfigMockedComponent({ getNumber: jest.fn().mockResolvedValue(2) })
    })
  })
  afterEach(async () => {
    await components.database.query('DELETE FROM room_cleanup_dispatches')
  })

  describe('when a destructive dispatch was recorded', () => {
    beforeEach(async () => {
      await journal.dispatch(input)
    })
    it('should block the wallet after constructing a fresh journal component', async () => {
      journal = await createRoomCleanupJournalComponent({ database: components.database, config: components.config })
      await expect(journal.hasUnfinished(input.wallet)).resolves.toBe(true)
    })
    it('should refuse replay of the same operation', async () => {
      await expect(journal.dispatch(input)).resolves.toBe(false)
    })
    it('should preserve dispatched rows across epoch pruning', async () => {
      await journal.pruneConfirmed(input.wallet, 'epoch-b', [])
      await expect(journal.hasUnfinished(input.wallet)).resolves.toBe(true)
    })
    it('should reject a confirmation with a different cutoff', async () => {
      await expect(journal.confirm({ ...input, revokeBefore: 124 })).rejects.toThrow('did not match')
      await expect(journal.hasUnfinished(input.wallet)).resolves.toBe(true)
    })
    it('should durably record an actual cutoff advanced after dispatch admission', async () => {
      await journal.confirm(input, 456)
      await journal.confirm(input, 456)
      await expect(journal.get(input.wallet, input.epoch, input.operationId)).resolves.toEqual({
        ...input,
        revokeBefore: 456,
        state: 'confirmed'
      })
    })
    describe('and Cloud success is confirmed', () => {
      beforeEach(async () => {
        await journal.confirm(input)
      })
      it('should persist an idempotent exact receipt and clear unfinished admission', async () => {
        await journal.confirm(input)
        await expect(journal.hasUnfinished(input.wallet)).resolves.toBe(false)
        await expect(journal.get(input.wallet, input.epoch, input.operationId)).resolves.toEqual({
          ...input,
          state: 'confirmed'
        })
      })
      it('should retain a receipt that the positive plan still references', async () => {
        await journal.pruneConfirmed(input.wallet, input.epoch, [input.operationId])
        await expect(journal.get(input.wallet, input.epoch, input.operationId)).resolves.toBeDefined()
      })
      it('should prune only confirmed receipts no longer referenced by current authority', async () => {
        await journal.pruneConfirmed(input.wallet, input.epoch, [])
        await expect(journal.get(input.wallet, input.epoch, input.operationId)).resolves.toBeUndefined()
      })
    })
  })
  describe('when unique wallets fill the global journal capacity', () => {
    beforeEach(async () => {
      await journal.dispatch(input)
      await journal.dispatch({ ...input, wallet: '0x2222222222222222222222222222222222222222' })
    })
    it('should refuse additional wallet work', async () => {
      await expect(journal.dispatch({ ...input, wallet: '0x3333333333333333333333333333333333333333' })).resolves.toBe(
        false
      )
    })
  })
})
