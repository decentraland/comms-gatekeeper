import { IBaseComponent } from '@well-known-components/interfaces'

export type CleanupDispatch = {
  wallet: string
  epoch: string
  operationId: string
  clusterId: string
  revokeBefore: number
}

export type CleanupReceipt = CleanupDispatch & { state: 'dispatched' | 'confirmed' }

export type IRoomCleanupJournalComponent = IBaseComponent & {
  /**
   * Checks unfinished destructive calls across all epochs; restarts never clear them.
   * @param wallet - Canonical participant identity.
   * @returns Whether admission must remain blocked.
   * @throws On storage failure.
   */
  hasUnfinished(wallet: string): Promise<boolean>
  /**
   * Reads the durable receipt for an exact operation.
   * @param wallet - Canonical participant identity.
   * @param epoch - Pulse boot epoch.
   * @param operationId - Stable Pulse cleanup identifier.
   * @returns The persisted dispatch or confirmed receipt, when present.
   * @throws On storage failure or an invalid persisted cutoff.
   */
  get(wallet: string, epoch: string, operationId: string): Promise<CleanupReceipt | undefined>
  /**
   * Persists dispatch before Cloud is contacted.
   * @param input - Exact operation and intended cutoff floor.
   * @returns False for an existing operation or full global capacity.
   * @throws On storage failure; an ambiguous insert must be checked on the next hint.
   */
  dispatch(input: CleanupDispatch): Promise<boolean>
  /**
   * Persists the actual confirmed Cloud cutoff without lowering the recorded floor.
   * @param input - Original exact dispatch tuple and floor.
   * @param effectiveRevokeBefore - Actual cutoff sent after the final authority await.
   * @returns Once the confirmed receipt is durable; identical confirmed retries are safe.
   * @throws On storage failure, cutoff regression or tuple mismatch.
   */
  confirm(input: CleanupDispatch, effectiveRevokeBefore?: number): Promise<void>
  /**
   * Deletes an exact dispatched row after a known no-call or definite no-side-effect rejection.
   * @param input - Original exact dispatch tuple and floor.
   * @returns Once storage has processed cancellation; confirmed rows cannot be deleted here.
   * @throws On storage failure.
   */
  cancelDefiniteFailure(input: CleanupDispatch): Promise<void>
  /**
   * Drops confirmed receipts absent from a positive current Pulse plan; never deletes dispatched rows.
   * @param wallet - Canonical participant identity.
   * @param epoch - Current positively observed Pulse epoch.
   * @param operationIds - Operations still referenced by that authoritative plan.
   * @returns Once obsolete confirmed receipts are pruned.
   * @throws On storage failure.
   */
  pruneConfirmed(wallet: string, epoch: string, operationIds: string[]): Promise<void>
}
