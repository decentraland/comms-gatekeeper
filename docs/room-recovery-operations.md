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

Unknown removal outcome or confirmation after the cutoff blocks that wallet for this process
lifetime. No blind retry, timer expiry or capacity eviction clears an unknown receipt. Only definite
no-side-effect rejection permits a retry. Confirmed receipts are pruned after positive authority
proves their IDs no longer pending. `CLUSTER_TAKEOVER_RECEIPT_MAX` (default 10000) bounds the cache;
full capacity defers new removal. Snapshot/backlog/connect limits bound work queues.

Process crashes lose receipts. Uncertain Cloud outcomes across Gatekeeper process restart, Pulse
state loss, departed-wallet maintenance and old room cleanup are outside this narrowed guarantee.
There is no durable dispatch journal, SQL migration, operator bootstrap command or automatic restart
recovery protocol. Handle such cases through separately approved controlled maintenance with island
admission closed. Do not infer safe room reset from token TTL, broker flush or an absent participant.

The service requires one active Gatekeeper. Release overlap remains an accepted limitation. An old
Gatekeeper that ignores the new barrier must be quiesced during coordinated activation. Horizontal
scaling, deployment and destructive live-room maintenance require their own reviewed procedures.
