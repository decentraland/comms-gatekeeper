import SQL from 'sql-template-strings'
import { AppComponents } from '../../types'
import { positiveIntegerOr } from '../../utils/config'
import { CleanupDispatch, CleanupReceipt, IRoomCleanupJournalComponent } from './types'

/**
 * Creates the durable journal for island-room destructive calls.
 * 1. Record dispatch before calling Cloud. 2. Persist the exact confirmed result before reporting it.
 * Dispatched rows survive process and Pulse restarts; only controlled operator reconciliation can
 * resolve an uncertain result. Capacity is serialized locally under the one-active-Gatekeeper contract.
 * @param components - Existing PostgreSQL storage and capacity configuration.
 * @returns The journal. Database errors propagate and block cleanup and admission.
 */
export async function createRoomCleanupJournalComponent(
  components: Pick<AppComponents, 'database' | 'config'>
): Promise<IRoomCleanupJournalComponent> {
  const { database, config } = components
  const capacity = positiveIntegerOr(await config.getNumber('CLUSTER_CLEANUP_JOURNAL_MAX'), 20_000)
  let dispatchTail: Promise<unknown> = Promise.resolve()

  async function dispatch(input: CleanupDispatch): Promise<boolean> {
    const previous = dispatchTail
    const result = previous.then(async () => {
      const inserted = await database.query(SQL`
        INSERT INTO room_cleanup_dispatches (wallet, epoch, operation_id, cluster_id, revoke_before, state)
        SELECT ${input.wallet}, ${input.epoch}, ${input.operationId}, ${input.clusterId}, ${input.revokeBefore}, 'dispatched'
        WHERE (SELECT COUNT(*) FROM room_cleanup_dispatches) < ${capacity}
        ON CONFLICT (wallet, epoch, operation_id) DO NOTHING RETURNING operation_id`)
      return inserted.rowCount === 1
    })
    dispatchTail = result.catch(() => {})
    return result
  }

  return {
    async hasUnfinished(wallet) {
      const result = await database.query(SQL`
        SELECT 1 FROM room_cleanup_dispatches WHERE wallet = ${wallet} AND state = 'dispatched' LIMIT 1`)
      return result.rows.length > 0
    },
    async get(wallet, epoch, operationId) {
      const result = await database.query<CleanupReceipt>(SQL`
        SELECT wallet, epoch, operation_id AS "operationId", cluster_id AS "clusterId",
          revoke_before AS "revokeBefore", state FROM room_cleanup_dispatches
        WHERE wallet = ${wallet} AND epoch = ${epoch} AND operation_id = ${operationId}`)
      const row = result.rows[0]
      if (!row) return undefined
      const revokeBefore = Number(row.revokeBefore)
      if (!Number.isSafeInteger(revokeBefore) || revokeBefore <= 0) throw new Error('Invalid durable cleanup cutoff')
      return { ...row, revokeBefore }
    },
    dispatch,
    async confirm(input, effectiveRevokeBefore = input.revokeBefore) {
      if (!Number.isSafeInteger(effectiveRevokeBefore) || effectiveRevokeBefore < input.revokeBefore) {
        throw new Error('Cleanup confirmation cannot lower the dispatch cutoff floor')
      }
      const result = await database.query(SQL`
        UPDATE room_cleanup_dispatches SET state = 'confirmed', revoke_before = ${effectiveRevokeBefore},
          confirmed_at = COALESCE(confirmed_at, NOW())
        WHERE wallet = ${input.wallet} AND epoch = ${input.epoch} AND operation_id = ${input.operationId}
          AND cluster_id = ${input.clusterId} AND
          ((state = 'dispatched' AND revoke_before = ${input.revokeBefore}) OR
            (state = 'confirmed' AND revoke_before = ${effectiveRevokeBefore}))
        RETURNING operation_id`)
      if (result.rowCount !== 1) throw new Error('Cleanup confirmation did not match a durable dispatch')
    },
    async cancelDefiniteFailure(input) {
      await database.query(SQL`
        DELETE FROM room_cleanup_dispatches WHERE wallet = ${input.wallet} AND epoch = ${input.epoch}
          AND operation_id = ${input.operationId} AND cluster_id = ${input.clusterId}
          AND revoke_before = ${input.revokeBefore} AND state = 'dispatched'`)
    },
    async pruneConfirmed(wallet, epoch, operationIds) {
      await database.query(SQL`
        DELETE FROM room_cleanup_dispatches WHERE wallet = ${wallet} AND state = 'confirmed'
          AND NOT (epoch = ${epoch} AND operation_id = ANY(${operationIds}::text[]))`)
    }
  }
}
