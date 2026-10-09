# Pulse room recovery operations

Local implementation, 8 October 2026. Deployment and actual LiveKit Cloud acceptance have not
been performed. The [Pulse plan](https://github.com/decentraland/Pulse/blob/fix/pulse-owned-room-recovery/docs/demand-driven-recovery-protocol-plan.md)
owns the design; the [wire contract](https://github.com/decentraland/protocol/blob/feat/pulse-room-recovery/docs/pulse-room-recovery.md) owns subjects
and field semantics. Explorer retains its ordinary metadata contract.

## Startup and Pulse restart

A new Pulse epoch blocks island admission until an operator confirms recovery. Its `/about`
response exposes `roomRecovery.epoch`, `bootstrapRequired`, `pendingOperations` and
`retainedWallets`. Boot-scoped room IDs prevent old tokens targeting newly allocated rooms;
they do not evict participants from old rooms or revoke every old token.

1. Keep island admission closed during coordinated Pulse/Gatekeeper activation. Apply the
   Gatekeeper journal migration before starting the new subscriber. Old Gatekeepers must be
   stopped: they ignore the new admission fields. Quiesce any older island credential issuer.
2. Recover old island rooms under the existing controlled-maintenance procedure. Drain prior
   Gatekeeper removals and reconcile every interrupted dispatch described below. Scope cleanup
   to island rooms; scene, voice and cast rooms are independent. Do not assume token TTL alone
   removes connected users or refreshed tokens. If old membership/token history cannot be
   established, keep admission closed and resolve it with the LiveKit operator.
   Reclaim confirmed receipts for reviewed retired epochs as described below; a new Pulse
   cannot advertise old departed wallets, so normal per-wallet pruning cannot reach those rows.
3. Read the new lifetime without publishing anything:

   ```sh
   node dist/operations/room-recovery-bootstrap.js --pulse-url http://localhost:5000
   ```

4. After completing recovery, use operator NATS credentials and the exact observed epoch:

   ```sh
   node dist/operations/room-recovery-bootstrap.js --pulse-url http://localhost:5000 --epoch <observed-epoch> --execute --confirm-old-islands-reset --confirm-no-outstanding-removals
   ```

   `NATS_URL` supplies the broker address/credentials. Only the operator identity should be
   allowed to publish `pulse.room_recovery.bootstrap_completed`; ordinary Gatekeeper credentials
   publish wallet cleanup completions. The command neither resets rooms nor changes the journal.
   Its flags attest that those operations have already been completed.
5. Completion requires `/about` to show `bootstrapRequired: false` for that same epoch. The
   command checks this with bounded reads; broker flush alone is insufficient. A restart during
   confirmation fails closed. Per-wallet pending cleanup can continue to block credentials
   after bootstrap completes; inspect those operations separately.

For local development, run the TypeScript entry point with the repository's existing `ts-node`
instead of the built `dist` entry point. Use only an isolated test broker/database for automated
bootstrap tests. No live bootstrap command is part of build, tests or normal service startup.

## Retired-epoch journal maintenance

All journal rows count toward its capacity. A Pulse restart loses the completed-departure
records that normally trigger pruning, leaving confirmed receipts for absent wallets behind.
During controlled bootstrap, after old-room recovery and reconciliation of prior calls:

1. Keep admission closed and old issuers stopped. Read the exact current epoch from `/about`.
2. Inventory journal rows by epoch/state and export the exact candidate receipts as evidence.
   Review an explicit list of retired epochs; exclude the observed current epoch.
3. In a transaction, delete only confirmed rows from that list. For example, after replacing
   both placeholders with reviewed values:

   ```sql
   BEGIN;
   DELETE FROM room_cleanup_dispatches
   WHERE state = 'confirmed'
     AND epoch IN ('<reviewed-retired-epoch>')
     AND epoch <> '<current-epoch>'
   RETURNING wallet, epoch, operation_id, cluster_id, revoke_before;
   COMMIT;
   ```

4. Verify the remaining counts, preserved dispatched rows, and unchanged blocked Pulse epoch
   before confirming bootstrap. A restart requires repeating the epoch check and recovery.

This maintenance retires completed historical receipts. It never infers that a dispatched call
completed and never uses a TTL. The bootstrap command deliberately performs no database mutation.

## Interrupted LiveKit removal

Gatekeeper stores a `dispatched` record before calling LiveKit and a `confirmed` result before
reporting completion to Pulse. A crash, timeout or failed result persistence can leave the
record dispatched even if removal actually happened. Any such record blocks that wallet
across process restarts and Pulse epochs. It must not be removed by TTL or ordinary pruning.

The dispatch initially records a minimum cutoff. Gatekeeper calculates the actual cutoff after
its final database/authority await, immediately before calling Cloud, and persists that value
on confirmation. `CLUSTER_CLEANUP_CUTOFF_MARGIN_SECONDS` defaults to 5 (invalid values use the
default; values above 30 clamp to 30). `CLUSTER_CLEANUP_CLOCK_SKEW_ALLOWANCE_MS` defaults to 1000
and accepts integers from 0 through 5000. The effective margin covers at least the allowance plus
one whole second; the cutoff must also stay inside Cloud's 60-second window with that allowance.
Success requires local response time plus the allowance to precede the cutoff. Otherwise the
old client might have refreshed its token during the delayed request, so even HTTP success
leaves the dispatch unresolved. Its stored minimum is not evidence of the actual Cloud cutoff.

An operator must establish that the previous server operation has settled before permitting
another admission. Inspect the exact wallet, epoch, operation, cluster and cutoff in
`room_cleanup_dispatches`. After draining old issuers, reconcile the removal with LiveKit and
record the confirmed effective cutoff for that exact operation. A fresh removal must use a
valid current cutoff above earlier token boundaries. Retain evidence of the reconciliation;
do not bulk-delete dispatched records to unblock service.

Confirmed records let Gatekeeper re-report lost completions without another removal. Pulse
accepts only the current revision's retained operation. A current authoritative plan can
allow pruning confirmed operations it no longer references; that never proves an interrupted
operation completed. Database unavailability also defers admission.

For a completed departure, Gatekeeper prunes confirmed receipts and acknowledges the exact
ready plan. Pulse retains that wallet's cutoff until the acknowledgement arrives and its clock
passes the cutoff plus a 15-second grace. This covers up to five seconds of Gatekeeper token
backdating and ten seconds between Pulse/Gatekeeper clocks. A rapid return keeps the old floor.
Neither service uses a timer to infer completion of an uncertain removal.

## Acceptance before rollout

Verify old-token rejection and replacement-token admission against actual LiveKit Cloud,
including absent participants, refreshed tokens, successive same-second takeovers and delayed
responses. Verify Gatekeeper and every relevant Cloud node stay within the configured allowance,
and Pulse stays within five seconds of the same Cloud time. Stable clocks and Cloud refresh
tokens whose `nbf` does not exceed their issuing node's current time are required assumptions;
local tests cannot prove them. Configure the allowance above the measured bound.

Gatekeeper waits until the Pulse floor plus the allowance, then sets `nbf` to the greater of
that floor and its current time minus the allowance. It rechecks the lower time bound around
signing. This avoids creating a new future boundary after waiting and preserves the revocation
floor. Verify replacement admission at that boundary; the margin delays replacement delivery.
Also exercise a room exposed as ready but never created by a client.
Local mocks cannot establish Cloud enforcement. Verify bootstrap and interrupted
dispatch recovery in a controlled environment, then test two ordinary Explorers through the
connector. Existing Explorer metadata and credentials remain the client contract.
