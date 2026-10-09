# AI Agent Context

**Service Purpose:** Acts as the guardian of LiveKit tokens within Decentraland's communication architecture. Processes signed fetch requests from clients and generates tokens that grant access to LiveKit rooms dedicated to specific scenes or worlds. Manages scene administration, streaming access, voice chat, and user moderation.

**Key Capabilities:**

- **Issues LiveKit tokens** that are the mandatory credential for any client to enter the Genesis City platform and interact with other players — no token, no access
- Enforces **platform-level user bans at connection time**: banned users are rejected during token issuance and cannot re-enter any Genesis City room
- Generates secure LiveKit tokens for scene/world-specific communication rooms
- Manages scene administration (add/remove admins, ban users from individual scenes)
- Provides RTMP streaming URLs and keys for content creators
- Supports private voice chat sessions between users
- Implements community voice chat with speaker management and request-to-speak functionality
- Manages streaming access lifecycle with expiration and TTL
- Handles user privacy settings and access control
- Integrates with LiveKit webhooks for real-time event handling

**Communication Pattern:** Synchronous HTTP REST API with Signed Fetch authentication (ADR-44), plus an
asynchronous NATS subscription that feeds the cluster subscriber (island rooms, see below).

**Technology Stack:**

- Runtime: Node.js (LTS version)
- Language: TypeScript
- HTTP Framework: @dcl/http-server
- Database: PostgreSQL (via @well-known-components/pg-component)
- Communication: LiveKit Server SDK for token generation and room management
- Messaging: NATS (`nats` client, thin custom adapter) for Pulse's cluster feed, behind `CLUSTER_SUBSCRIBER_ENABLED`
- Component Architecture: @well-known-components (logger, metrics, http-server, pg-component, env-config-provider)

**External Dependencies:**

- **LiveKit**: Real-time voice communication infrastructure for token generation and room management
- **PostgreSQL**: Scene administration, streaming access, voice chat users, and ban records
- **Catalyst**: Content server for scene metadata and validation
- **Places API**: Scene and place information
- **Social Service**: User relationships and social data
- **AWS SNS**: Event notifications for streaming and communication events
- **NATS**: Message broker carrying Pulse's `cluster_change` feed, which this service consumes, and its
  re-published `island_changed`
- **Pulse**: Owns peer clustering and cluster sizing (replacing Archipelago Core); publishes per-peer cluster
  assignments over NATS. It also publishes an `engine.islands` topology snapshot, which this service does
  not consume — that one feeds archipelago-stats

**Key Concepts:**

- **LiveKit Rooms**: Each scene/world gets a dedicated LiveKit room identified by a room name (e.g., `scene:realm:sceneId`)
- **Scene Administration**: Scene admins can manage access, ban users, and control streaming access
- **Streaming Access**: Content creators can request RTMP streaming URLs and keys for broadcasting to scenes
- **Voice Chat Types**:
  - Private voice chat: Direct communication between users
  - Community voice chat: Moderated group communication with speaker management
- **Request-to-Speak**: Users can request permission to speak in community voice chats
- **Streaming TTL**: Streaming access has time-to-live and expiration mechanisms
- **Scene Bans**: Users can be banned from specific scenes by scene admins
- **Platform Ban (global ban)**: A platform-level ban blocks a user from obtaining a LiveKit token from comms-gatekeeper. Because a token is required to enter any Genesis City room, a platform-banned user is excluded from real-time interaction in Genesis City. Bans are stored in the `user_bans` table (address-scoped; `scene_bans` is the separate scene-scoped table) and enforced synchronously at token issuance time — the request is rejected before any LiveKit call is made. Enforced on every wallet-scoped token path: scene comms (`POST /get-scene-adapter`), private messages (`GET /private-messages/token`), private and community voice chat (`POST /private-voice-chat`, `POST /community-voice-chat` — for a private call, either participant being banned refuses the whole call), Cast viewing (`POST /cast/watcher-token`), and every path that returns or mints a streaming key: `GET /cast/generate-stream-link` (including its local-preview branch, which skips the admin check but not this one) and the legacy `GET`/`POST`/`PUT /scene-stream-access` (`DELETE` is not gated: revoking a key removes access rather than granting it). **Not** enforced on the two key-bearer Cast paths (`POST /cast/streamer-token`, `POST /cast/presentation-bot-token`): those authenticate a streaming key rather than a wallet, so there is no identity to match a ban against. Blocking the mint is what covers them — a banned admin cannot obtain a new key, but a key minted before the ban keeps working until it expires (4 days).
- **Device-based ban evasion**: A platform ban snapshots the player's last recorded device id (`user_bans.banned_device_id`, sourced from `player_connection_info`) so a banned player who reconnects from the same device under a different wallet is also rejected. This is enforced **only at token issuance**, via `getActiveBanForConnection`. That gate matches the device id the request arrives with; when a request carries none — which is every voice and cast request — it falls back to the device the address was last recorded connecting from, so a wallet with a prior connection from a banned device is rejected even on a path that never sees a device identifier. The fallback is race-free against the concurrent connection-info upsert because that upsert `COALESCE`s a null incoming device onto the stored value, so a device-less request cannot clobber the row the gate reads. Two limits are accepted rather than worked around: only the last recorded device is consulted (not a full per-address device history, so an address that has since connected from a clean device no longer matches its earlier banned one), and a device is only ever recorded on the paths that receive one — scene comms and private messages — so a wallet that exclusively uses Cast is matched on address alone. `GET /users/{address}/bans` reports device coverage too, so a client can tell a player they are banned instead of leaving them to discover it when a token request fails — but it receives only an address, so its device term is always the recorded one, while token paths prefer the device the request carries. The two can disagree when a request arrives on a device other than the recorded one; the endpoint is for user-facing messaging, and token issuance stays authoritative for a concrete request. It calls `getActiveBanForConnection`, never `isPlayerBanned` — `banPlayer` uses the latter as its duplicate guard and `liftBan` matches on `banned_address`, so widening it would make a wallet that merely shares a device impossible to ban and impossible to lift. The ban record is returned only when it is the queried address's own; a device match reports `isBanned: true` with no record, since the matching row belongs to another player. `bannedDeviceId` is stripped from that record on this route — the device id is a stable cross-wallet machine identifier and the route is unauthenticated, so moderator tooling reads it from the moderator-gated `GET /bans` instead. The route is unauthenticated, so a caller can test any address for device coverage: an accepted trade-off for telling banned players why they are blocked.

**Role in Genesis City Comms Access:**

The Comms Gatekeeper is the access authority for player-to-player interaction in Genesis City. Specifically:

- **LiveKit token as the mandatory platform credential**: A LiveKit token issued by comms-gatekeeper is the single required credential to enter the Genesis City platform. Without it, a client cannot join any room and cannot see other players, hear voice, or exchange CRDT. There is no alternative path — token issuance by comms-gatekeeper is the gate.
- **Scene rooms and island rooms**: Controls access to both scene-specific LiveKit rooms (tied to a particular scene/parcel) and island rooms (the dynamic clustering rooms; Pulse owns clustering, and this service's cluster subscriber mints the island token). Both require a token from comms-gatekeeper.
- **The enforcement point for Genesis City interaction**: All ban checks, permission checks, and access-control decisions for real-time Genesis City interaction happen here, synchronously, before a token is issued.
- **Scoped to Genesis City**: The Comms Gatekeeper's role applies to Genesis City scenes and islands. For Worlds, the access control gatekeeper role is fulfilled by the Worlds Content Server, which may use a separate LiveKit account/cluster.

**Token issuance in the real-time flow:**

There are two token paths in the real-time layer, and comms-gatekeeper mints both:

1. **Pulse cluster feed → comms-gatekeeper → LiveKit (NATS):** Pulse owns peer clustering and publishes each peer's cluster assignment on `peer.{addr}.cluster_change`. This service's cluster subscriber (see below) consumes that feed, mints the LiveKit token itself, and re-publishes the `island_changed` message — `connStr` is a LiveKit connection string with an embedded token (`livekit:{host}?access_token={jwt}`) — on the session-addressed `engine.peer.{addr}.island_changed.{session}` whenever the event names a valid session, which WS Connector forwards only to the socket holding that session, or on the legacy `engine.peer.{addr}.island_changed` when it does not (an older Pulse), which WS Connector forwards to the client unchanged. This token grants access to the island room. This replaces the hop Archipelago Core used to own; Archipelago Core is being decommissioned.

2. **Client → comms-gatekeeper (signed fetch):** For scene-specific rooms and for Hammurabi bots, the caller explicitly requests a token from comms-gatekeeper. This path is used when the `CommsTransportWrapper` adapter is `comms-gatekeeper` (the default for Genesis City scenes). Hammurabi bots authenticate here using `PROCESS_PRIVATE_KEY`.

Both paths enforce bans synchronously in this service, before a token is issued. Path 2 checks platform bans at token issuance time. Path 1 (island rooms) has its own gate: wallet plus the device id recorded from that wallet's last HTTP token request, plus the platform deny list — the island room is mic-only voice, so a wallet-only check would make it the weak link versus the HTTP path.

**Database Schema:**

- **Tables**: `scene_admin` (scene administrators), `scene_stream_access` (streaming URLs and keys), `scene_bans` (banned users), `voice_chat_users` (private voice chat participants), `community_voice_chat_users` (community voice chat with moderation)
- **Key Relationships**: Scene admins manage scenes, streaming access is per scene, bans are per scene, voice chat users are per room
- **Full Documentation**: See [docs/database-schemas.md](docs/database-schemas.md) for detailed schema, column definitions, and relationships

**API Specification:** Full OpenAPI 3.0 spec at [docs/openapi.yaml](docs/openapi.yaml). Endpoint groups:

- **Token issuance** (`/scene-adapter`): generate LiveKit tokens for scene rooms — the primary entry point to the platform. Island-room tokens are not an HTTP endpoint; they are minted by the cluster subscriber in response to Pulse's NATS feed (see below).
- **Scene administration** (`/scene-admin`): add/remove scene admins
- **Moderation** (`/scene-bans`, `/users/{address}/bans`, `/users/{address}/warnings`, `/bans`): ban/unban/warn users at scene scope or platform scope; platform moderation endpoints require the moderator role via Signed Fetch
- **Streaming** (`/scene-stream-access`): RTMP URL and key lifecycle for content creators
- **Voice chat** (`/private-voice-chat`, `/community-voice-chat`): session creation, speaker management, request-to-speak
- **Webhooks** (`/livekit-webhook`): receive LiveKit server events (room created/destroyed, participant joined/left)

**Authentication Notes:**

- Most endpoints require Signed Fetch authentication (ADR-44)
- Scene-based requests require scene metadata (sceneId, parcel, realmName) in identity headers
- Explorer-based requests use different identity header format
- Service-to-service communication uses Bearer tokens

## Pulse-owned island-room recovery

Pulse owns the desired wallet/session assignment, retained room cleanup operations, admission
readiness and revocation floors. Gatekeeper is the LiveKit actuator. Explorer receives ordinary
island tokens and metadata; client-provided metadata is never recovery authority.

The subscriber consumes `peer.*.cluster_change`, `peer.*.cluster_snapshot` and authenticated
session-bearing `peer.*.connect`. Each message triggers the existing positive
`peer.{wallet}.cluster_assignment` lookup. A reply must carry a valid `roomRecovery` plan with an
epoch, decimal revision, pending/ready admission, cleanup operations and token not-before floor.
Transport silence, missing/default recovery fields, mismatched sessions, malformed state and
unavailable access checks defer work. Every credential path follows this barrier; the former
`CLUSTER_AUTHORITY_LOOKUP_ENABLED` bypass is removed.

Pending room cleanup is serialized per wallet. Before each destructive call, Gatekeeper inserts
`room_cleanup_dispatches` in PostgreSQL. Dispatched rows block that wallet across Gatekeeper and
Pulse restarts, regardless of epoch. The final cutoff is calculated immediately before Cloud
execution, after database and authority awaits: the maximum of Pulse's required floor and local
current whole second plus `CLUSTER_CLEANUP_CUTOFF_MARGIN_SECONDS` (default 5, maximum 30).
A cutoff at least 60 seconds in the future, including the clock skew reserve, defers. Definite no-side-effect application rejections
may retry with a fresh cutoff; transport failures, `not_found`, uncertain server errors and a
success received at or after its cutoff keep the durable dispatch blocked. There is no automatic
retry or expiry for that uncertainty. Controlled operator reconciliation is required.

A Cloud success arriving before the boundary is durably confirmed with its actual cutoff before
Gatekeeper publishes `RoomCleanupCompleted` on `peer.{wallet}.room_cleanup_completed`.
A successful broker flush proves no application acknowledgement. Gatekeeper positively rereads
Pulse readiness for the exact epoch/revision before signing or publishing credentials. Lost
completion reports reuse the confirmed operation receipt, including after restart, without
another removal. If confirmation persistence fails, only the original process may retry its
positively known result; a new process treats the durable dispatch as unresolved.

Ready assignments wait for a future Pulse token boundary before checking presence or access.
The wait includes the configured Cloud clock skew reserve, is bounded below 60 seconds, cancelled on shutdown, and followed by fresh exact ready
authority and unfinished-journal checks. A newer future floor defers to another hint. When absent, Gatekeeper
checks bans and the deny list, rereads exact ready authority, signs with
`nbf = max(floor((localNow - skewAllowance)/1000), Pulse tokenNotBefore)`, and rereads authority after signing.
Credentials are delivered only once `nbf` is valid with the skew reserve; rollback during signing defers delivery.
The clock reserve defaults to 1000ms; invalid values outside integer 0..5000 use that default.
The removal margin is at least `ceil(skewAllowance/1000)+1` seconds. Positive removal must arrive strictly
before cutoff minus the reserve. Cloud/Gatekeeper skew must be measured to remain within the configured bound;
the code does not cover arbitrary skew. Admission does not rely on future-token leeway. The ordinary
`engine.peer.{wallet}.island_changed.{session}` message has empty peers and no recovery metadata.
No legacy wallet-only subject is emitted. `peerState` supplies only `fromIslandId` and cannot
authorize revocation or credentials. Banned and departed wallets can still complete cleanup;
access checks apply to issuance.

Confirmed journal receipts are pruned only after a positive current plan no longer references
them. Completed departures remain queryable in Pulse as `cleanupOnly + ready`, with empty desired
cluster/realm and the retained last session selector. Gatekeeper prunes confirmed rows, rereads
that exact ready departure and publishes an `observedReady` completion with empty operation/room
and zero cutoff. Pulse retains the tombstone until it observes that acknowledgement and its
clock strictly passes the cutoff plus a 15-second grace (maximum 5-second Gatekeeper backdating
plus maximum 10-second Pulse/Gatekeeper offset). Returning wallets inherit the retained cutoff.
Cloud, Pulse and Gatekeeper clocks must satisfy those measured bounds before release.
Lost observation reports repeat through hints. No timer infers an
acknowledgement and dispatched rows are never pruned. `CLUSTER_CLEANUP_JOURNAL_MAX` bounds journal
retention globally; a full journal blocks new cleanup and exposes a metric.

Pulse uses boot-scoped room IDs and starts each epoch requiring explicit controlled bootstrap.
Gatekeeper defers all room work while `bootstrapRequired` is true. The manual
`src/operations/room-recovery-bootstrap.ts` command requires an exact epoch and explicit operator
assertions that old islands were reset and outstanding destructive requests settled; it makes no
Cloud or database reset calls. Pulse state loss and bootstrap cannot be repaired through metadata
or old acknowledgements. Unknown journal records still block after bootstrap.

Recovery concurrency and backlog remain bounded by `CLUSTER_SNAPSHOT_CONCURRENCY`,
`CLUSTER_SNAPSHOT_BACKLOG` and `CLUSTER_CONNECT_CONCURRENCY`; all operation types share the same
wallet queue. Shutdown cancels subscriptions and blocks new side effects after awaits. It cannot
cancel a dispatched Cloud request; the journal preserves that uncertainty across process exit.
One active Gatekeeper is required. Rolling-release overlap remains an accepted limitation;
no distributed lock or zero-downtime guarantee is added.

This backend contract requires coordinated Pulse/Gatekeeper activation under no admission.
An old Gatekeeper ignores additive recovery fields and cannot safely coexist with the new
producer. The exact published protocol CI artifact is pinned in the manifest and lockfile;
[dependency provenance](protocol-dependency.md) records its source and integrity. Promotion to
the reviewed main release remains a rollout gate. Real-broker tests use local PostgreSQL and
JWT signing with mocked Cloud removal. LiveKit Cloud cutoff enforcement, clock skew bounds,
absent-room behavior and latency margins require separate controlled
acceptance; unit tests do not establish those guarantees.


## Stream-access expiration and renewal

All credential consumers use `getStreamAccessExpirationTime`: the stored timestamp or, for legacy
rows, `created_at + FOUR_DAYS`. Equality with the current time is expired. GET stream-access does
not return expired keys. Automatic renewal creates a fresh LiveKit ingress and key only when the
existing access is not streaming. Add and Cast link generation return 409 if replacement would
interrupt a live broadcast. Stop the broadcast first, or explicitly use the reset endpoint, which
immediately deletes the previous ingress through `removeReplacedIngress` and requires an OBS key
update. Idle-key renewal also immediately attempts deletion after persisting the replacement.
Failed deletions remain queued for the cleanup job.

Cleanup selects at most 100 rows ordered by expiry/retry time, using separate indexed queries for
new expirations and pending deletions. A claim leases one row for five minutes with a unique token
and moves its retry time ten minutes forward. Repeated failures therefore move behind other ready
work. A crashed worker's row becomes retryable without manual intervention. Only the current lease
holder can complete cleanup; stale workers cannot complete another worker's claim or notify.
Only genuine expirations can notify, and newer access records suppress the old notification even
when an admin has since deleted the replacement. Replacement cleanup never sends expiry notices.
Notification delivery is best effort after completion; a crash between completion and delivery can
lose a notification, but cannot duplicate it through another cleanup claim.

The additive migrations run automatically at component startup. For the first deployment of this
cleanup protocol, stop all previous-version instances before starting the new ones: old workers
still deactivate by place ID and do not honor leases. A rolling overlap with the previous cleanup
implementation is unsafe; subsequent versions using the lease protocol can overlap.

## Recovering missed ingress-ended webhooks

After its four-hour enforcement pass, the minute-based streaming TTL checker reconciles older
RTMP streaming flags with LiveKit. It skips starts less than two minutes old and rows without an
ingress ID. Each pass selects at most 20 rows, ordered by their last check, and postpones another
check for at least one minute. Row locks with SKIP LOCKED let workers skip busy candidates;
advancing `streaming_checked_at` rotates batches even when API calls fail.

LiveKit reads use five concurrent requests with five-second timeouts: at most four groups, or
20 seconds of API timeout waits after enforcement. Buffering and publishing remain streaming.
Confirmed inactive, error, complete, or missing ingresses may clear the flag; unknown state and
API failures leave it unchanged. Reconciliation never deletes ingresses or sends notifications.
Normal renewal and expiry cleanup can proceed after a stale flag is cleared.

Every ingress-started delivery reaches the manager and increments `streaming_state_version`,
even if a missed end event left `streaming=true`. Clearing a stale flag requires the same access
ID, ingress ID, start timestamp, and version to still be active and streaming. This fences newer
start webhooks, including same-millisecond starts, without relying on the boolean flag. Repeated
starts while already marked streaming preserve the original four-hour clock, so duplicate
webhook deliveries cannot extend it. If an end event was missed, that clock remains conservative
until a stopped state is observed. Database bigint timestamps may be strings or null; the version
is returned as a string and is compared in SQL without JavaScript arithmetic.

Startup migrations add the check timestamp and version columns. The partial index is built
concurrently in a separate non-transactional migration so its build does not block table writes.
The initial rollout must avoid overlap with previous-version webhook consumers that skip the
version update; use the coordinated rollout described above. Recovery is eventual: the two-minute
start grace, checker schedule, backlog, and API availability determine when a missed end event is
repaired. Explicit key reset remains available.
