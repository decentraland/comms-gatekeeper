# Pulse takeover recovery operations

This narrow contract covers one running Gatekeeper process and Pulse's retained pending takeover
list. No deployment or real LiveKit Cloud verification is implied by local tests.

Gatekeeper treats broker change/snapshot/connect messages as hints and positively reads exact-session
Pulse authority. Optional `tokenNotBefore` must be present; zero is valid. Legacy displaced fields
are informational. Each pending takeover removes/revokes the wallet in its displaced room. A bounded
process receipt is confirmed before `peer.{wallet}.takeover_completed` is published. Lost completion
resends the identical ID/cutoff without repeating confirmed removal. Only a fresh positive response
with no pending takeovers permits credentials; exact assignment and floor are checked around awaits.

The cutoff strictly exceeds all previously completed floors and process receipts, including
same-second A -> B -> A. Clock reserve, cutoff wait and exact-session fencing are described in
[agent context](ai-agent-context.md). Measure Cloud/Gatekeeper/Pulse skew and removal latency before
controlled acceptance. Mocked removals and real NATS tests cannot establish Cloud enforcement.

A confirmed removal that arrives after its usable cutoff is retried with a fresh cutoff and
fresh Pulse authority, within the configured attempt bound. The previous call has settled.
LiveKit Cloud's documented participant-missing result also confirms revocation; a generic 404
does not. See [LiveKit participant removal](https://docs.livekit.io/intro/basics/rooms-participants-tracks/participants/#remove-participant).

Rate-limited responses (`resource_exhausted`, 429) and the exact application response
`not_found`, 404, `requested room does not exist` release the dispatch receipt for bounded
retry after fresh Pulse lookup. They do not confirm revocation: Pulse keeps the operation
pending until a successful removal or documented participant-missing result. A later hint
retries after the condition clears. Other server errors may still follow partial execution.

Unknown transport outcomes block that wallet for this process lifetime. A client timeout does
not prove server cancellation: the old removal could still disconnect a newly admitted winner.
No retry, expiry or capacity eviction clears that uncertainty. Confirmed receipts are pruned
after positive authority proves their IDs absent, or reclaimed under capacity pressure after
their cutoff plus admission-token lifetime and clock reserve. Repeating settled work still
requires a current pending ID from Pulse. Token lifetime never settles an unknown operation.

`CLUSTER_TAKEOVER_RECEIPT_MAX` (default 10000) bounds the cache. Exhaustion by genuinely unknown
operations still defers new removals; unrelated ready assignments can proceed. Alert on any
increase in `dcl_gatekeeper_cluster_cleanup_capacity_total` or
`dcl_gatekeeper_cluster_cleanup_unfinished_total` and investigate before admission backlog grows.
Snapshot/backlog/connect limits bound work queues.

Access-gate and participant-membership lookup failures intentionally defer island admission,
including ban-registry outages. This changes the earlier fail-open behavior. A later hint or
connect retries the checks after recovery; failures create no permanent wallet block.

Process crashes lose receipts. Uncertain Cloud outcomes across Gatekeeper process restart, Pulse
state loss and old room cleanup are outside this narrowed guarantee.
There is no durable dispatch journal, SQL migration, operator bootstrap command or automatic restart
recovery protocol. Handle such cases through separately approved controlled maintenance with island
admission closed. Do not infer safe room reset from token TTL, broker flush or an absent participant.

## Activation and rollback

One active Gatekeeper is required. The default ECS rolling policy (minimum 100%, maximum 200%)
violates this even with desired count 1: a queue group does not serialize a wallet across tasks.
The repository's deployment workflows delegate to the shared deploy action; they do not enforce
the ECS service policy. Complete the following maintenance procedure before enabling this pair:

1. Verify the pinned main-release protocol package and the reviewed Pulse/Gatekeeper images.
2. Close island admission. Suspend scaling that can create another Gatekeeper task. Scale
   Gatekeeper to zero; wait for running and pending counts to reach zero and every previous task
   to reach `STOPPED`. Reconcile any uncertain removal before reopening admission.
3. Deploy the matching Pulse first, as one instance. Require NATS ACLs that reserve assignment
   responses to Pulse and `peer.*.takeover_completed` publishing to Gatekeeper; Connector/client
   credentials must not have either authority. Verify assignment lookup with the new fields.
4. Configure Gatekeeper desired count 1 and deployment minimum 0% / maximum 100%, then start the
   reviewed image. Verify exactly one task subscribes and run the takeover/reconnect smoke checks
   before reopening admission. Enable the Pulse recovery-capacity alert before opening admission.
   The zero-task barrier also applies to subsequent deployments;
   minimum/maximum percentages alone are not evidence that an old consumer has drained.

Rollback closes admission and stops Gatekeeper through the same zero-task barrier before
restoring the previous compatible Pulse/Gatekeeper pair. Roll back images together; an old
Gatekeeper ignores pending takeovers, and a new Gatekeeper rejects an old Pulse's missing floor.
There is no flag that bypasses assignment authority. This procedure is a rollout prerequisite,
not evidence that any live ECS configuration or broker permissions have been changed.
