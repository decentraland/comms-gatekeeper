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
- **Keeps the presence map**: consumes Pulse's `engine.parcel_changes` and knows where every online player
  stands, which is what `GET /hot-scenes` and (behind a flag) `GET /scene-participants` are answered from

**Communication Pattern:** Synchronous HTTP REST API with Signed Fetch authentication (ADR-44), plus two
asynchronous NATS subscriptions: one feeds the cluster subscriber (island rooms) and one feeds the presence
map (`/hot-scenes`, `/scene-participants`). Both are described below.

**Technology Stack:**

- Runtime: Node.js (LTS version)
- Language: TypeScript
- HTTP Framework: @dcl/http-server
- Database: PostgreSQL (via @well-known-components/pg-component)
- Communication: LiveKit Server SDK for token generation and room management
- Messaging: NATS (`nats` client, thin custom adapter) for Pulse's cluster feed (behind
  `CLUSTER_SUBSCRIBER_ENABLED`) and its parcel-changes feed (behind `PRESENCE_MAP_ENABLED`)
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
- **Pulse**: The source of online-player information (replacing Archipelago Core and archipelago-stats). Owns
  peer clustering and cluster sizing and publishes per-peer cluster assignments over NATS; also publishes
  `engine.parcel_changes`, the feed this service's presence map consumes, and serves `GET /peers?all=true`,
  read once on boot to prime that map. It also publishes an `engine.islands` topology snapshot, which this
  service does not consume

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
- **Presence** (`/hot-scenes`, `/scene-participants`): public, unauthenticated reads of who is where, taken
  over from archipelago-stats (see the presence map section below)

**Authentication Notes:**

- Most endpoints require Signed Fetch authentication (ADR-44)
- Scene-based requests require scene metadata (sceneId, parcel, realmName) in identity headers
- Explorer-based requests use different identity header format
- Service-to-service communication uses Bearer tokens

## Cluster subscriber (island rooms)

Replaces the one hop `archipelago-core` owned. Pulse clusters peers; this service turns an
assignment into a LiveKit connection string. Behind `CLUSTER_SUBSCRIBER_ENABLED`, default off.

**Consumes**:

| Subject | Payload | Use |
|---|---|---|
| `peer.{addr}.cluster_change` | `decentraland.pulse.PeerClusterChange` with `session`, `displaced_session`, `displaced_cluster_id` | drives minting; queue-grouped so one replica handles each event |
| `peer.{addr}.cluster_change` (again) | `decentraland.pulse.PeerClusterChange` with `session`, `displaced_session`, `displaced_cluster_id` | refreshes the assignment mirror only; **not** queue-grouped, so every replica records every assignment |
| `peer.{addr}.connect` | the connecting socket's session key (its auth chain's ephemeral address), UTF-8; a non-address payload is an older WS Connector | a comms session started; re-announces the wallet's island. Queue-grouped, so exactly one replica answers |

**Produces** `engine.peer.{addr}.island_changed.{session}` (`IslandChangedMessage`) whenever the event
names a valid session — WS Connector forwards the five-token subject only to the socket holding that
session — or the legacy `engine.peer.{addr}.island_changed` when it does not (an older Pulse). `peers`
is published empty: unity-explorer reads only `connStr`. WS Connector must already subscribe to the
five-token subject in an environment before this runs.

**Pipeline:** decode → wallet-or-device ban check plus deny list, fail-open, 30 s cache →
park the displaced session first, when it names a different, valid one (F4, see Parking below) →
evict the displaced session (when named) → room name → `generateCredentials(wallet, room, { cast: [] }, false,
undefined, attributes)`, stamping the minting session as the `dclsession` LiveKit participant attribute
whenever it is a valid session key (an older Pulse or a malformed value mints no attribute) → publish.
The attribute key has no separators on purpose (F1a): LiveKit camel-cases a key containing `.`, `_` or
`-` on `listParticipants` (a token attribute of `dcl.session`, `dcl_session` or `dcl-session` all come
back as `dclSession`), so `dclsession` is the only spelling that round-trips intact - the reader
tolerates nothing else.

**Reconnects.** Pulse's feed is edge-triggered: it stays silent while a peer's cluster is
unchanged. A client whose websocket drops and comes back without the crowd moving would
therefore never be given a room, because nothing else in iteration 1 can originate an island
— WS Connector is a pure forwarder, and `archipelago-core`, which used to cover this by
forgetting the peer on disconnect and re-creating it on the next heartbeat, is gone. The
`peer.{addr}.connect` subscription closes that gap by replaying the wallet's assignment through
the same mint-and-publish path, so the client gets a freshly minted token rather than the
expired one it was last sent.

**Takeovers.** When a `cluster_change` names a `displaced_session`, that wallet's participant is removed
from `island-{displaced_cluster_id}` with every token minted before the revocation stamp revoked, and
only then is the new session's token minted — LiveKit revokes `nbf < revokeTokenTs` at second
granularity, so the order is what keeps the new token valid. The stamp is this event's **receipt
second** — `Date.now()` captured when the handler first sees the event, not "now" at removal time —
taken once and reused for every attempt (F2a): a retry after a transient failure can then never revoke
a token minted for the new session by another replica's connect-path re-announce in between. Three
attempts, `CLUSTER_TAKEOVER_RETRY_DELAY_MS` × attempt apart. A
not-found answer means the displaced participant had already left; it is counted as
`dcl_gatekeeper_cluster_takeover_absent_total`, not retried, and — because LiveKit records the revocation
only with a removal — its cached token stays valid until it expires (at most five minutes). The
displaced client reconnects against a revoked token - and, on a LiveKit build that does not enforce
revocation on a fresh join, may succeed anyway (see Parking below) - and once it re-handshakes, its
`connect` names a session other than the one Pulse last published: parked when the mirror still
remembers that session as displaced for the wallet, or otherwise not re-announced, exactly as the
Reconnects section below describes. No client change is involved; a superseded client loops without
success by decision.

Before the removal, when the displaced cluster is the same room the new session is about to join,
another replica's connect-path self-heal (see Reconnects below) may already have evicted the displaced
device and re-announced the new session into it: removing by `wallet`, identity-wide, would then kick
the very device this whole fix protects (N1). The direct path lists that room's holders first in that
case, skips the removal entirely when every holder already carries the new session
(`dcl_gatekeeper_cluster_takeover_skipped_live_total`), and otherwise removes by the exact identity or
identities LiveKit listed - never `wallet` wholesale - deduped, the same as the connect path's own
self-heal (I1). A listing failure falls through to the identity-wide removal, fail-closed towards
eviction, same as everywhere else in this pipeline.

**Parking (F4).** livekit-server v1.13.6 does not enforce token revocation on a fresh join - measured
with the stamp at "now", in the future, against a minute-old token, with or without an `iat` claim, all
accepted. The eviction above ends the displaced device's current media session, but a removed device's
island room re-joins with its original connection string after its own backoff, and that fresh join is
let back in. In a shared room LiveKit then disconnects the **live** participant under that identity
instead (`DUPLICATE_IDENTITY`, which the client treats as final) - eviction alone cannot enforce "the
first must not re-join".

What every client does honour is its latest island assignment. So, before evicting or minting for the
new session, `processClusterChange` parks a genuinely different, valid displaced session: it mints that
session a token into a private room `island-parked-{first 16 hex chars of the session}` (the `island-`
prefix so clients, and this service's own webhook handlers, treat it as an ordinary island) and
publishes that as an `IslandChangedMessage` to the displaced session's own five-token subject -
indistinguishable from any other island reassignment, so no client change is needed. A successful
publish counts `dcl_gatekeeper_cluster_takeover_parked_total`; a mint or publish failure instead counts
the existing `dcl_gatekeeper_cluster_publish_failed_total`, logs, and never blocks the eviction or the
live mint that follow - parking must not be able to strand the live session.

The assignment mirror also remembers, per wallet, the sessions Pulse has named - or that this replica
has inferred, when the wallet's live session simply changed without an explicit `displaced_session` -
as displaced: a small, capped (8), oldest-first window (`MirrorEntry.displaced`), which forgets a
session the instant it becomes the wallet's live one again (B2) - a session cannot be simultaneously
live and displaced, and leaving it in the window would make it a candidate for parking on its own next
reconnect. A `peer.{wallet}.connect` from one of those remembered sessions - its ws socket dropped and
it re-handshook after being displaced - is judged, after the ban gate, on positive evidence from
LiveKit rather than on the remembered-displaced fact alone (B2): only when some holder of the wallet's
identity in its last known room still carries the mirror's live session is it parked
(`dcl_gatekeeper_cluster_reannounce_parked_total`, see Reconnects below). Without that evidence - the
live device has already left, or LiveKit cannot be read - or when the connecting session is neither the
mirror's live one nor a remembered displaced one, it keeps today's `…skipped_other_session_total`: the
connecting session re-handshakes with the exact same key a returning device would use, so it may simply
be that device signing back in, or a new one Pulse has not published for yet, and Pulse's own
`cluster_change`, if it is legitimate, follows and assigns it normally.

The parked client ends up alone in a room nobody else is ever assigned to, functionally "no comms" -
the accepted outcome for a superseded client; it recovers only by signing in again. Parked rooms close
on LiveKit's empty timeout, same as any other island room nobody is left in.

Resolution reads `src/adapters/assignment-mirror/`, not peer state. Minting is queue-grouped, so
a replica's peer state covers only the events it was handed; two replicas answering one
reconnect from it would name different clusters, and the client would settle in whichever
arrived last. The mirror is written from the second, un-grouped `cluster_change` subscription so
every replica agrees, and the connect subscription is grouped so only one of them replies.

The re-announcement classifies whoever `livekit.listParticipantsHolding` finds under the wallet's
identity in its last known room (only the signalling socket has to have dropped for a `connect` to
fire, so the peer is often still in its room, and handing it a connection string again would put two
participants under one identity, which LiveKit resolves by evicting the existing one). The
classification is only **judgeable** when both the connecting session and the mirror's recorded one
are real session keys — an older WS Connector's connect payload names none, and an older Pulse's
assignment mints no attribute, so no holder could ever carry one to compare:

- **Judgeable**, by each holder's `dclsession` attribute:
  - a match with the connecting session is the device already in it — suppress
    (`…reannounce_suppressed_total`).
  - a **different, valid** session is a displaced device that outlived its eviction (a stale mirror
    entry, a takeover retry still in flight on another replica, or an unrevoked re-join) — removed by
    the exact identity LiveKit listed it under (never the wallet — LiveKit matches identity exactly,
    and a foreign or legacy mint can be checksum-cased) with the same receipt-second revocation stamp
    the direct takeover path uses (`…reannounce_evicted_stale_total`; a `not_found` on the removal
    counts the same, since another replica or the direct takeover path may have just beaten it to
    it), then falls through to the re-announce below. If that removal fails for any other reason, the
    re-announce is abandoned instead — minting next to a displaced participant that refused to leave
    is exactly the race this guards against (`…reannounce_stale_evict_failed_total`).
  - **no attribute** is "cannot tell", not "stale": a LiveKit without attribute support, a pre-deploy
    token, or a genuinely legacy mint all look like this, and evicting on it would kick a live device
    on every one of its reconnects. Suppressed, never evicted (`…reannounce_suppressed_total`), same
    as a match — self-healing the takeover race still works, because a device this gatekeeper
    actually displaced always carries its own session attribute. **LiveKit without attribute support
    degrades to today's behaviour, it does not regress.**
- **Not judgeable** (either side is not a session key): any holder at all is read as already in — the
  identity-only check this replaced (`…reannounce_suppressed_total`).
- nobody there is a plain reconnect (`…reannounce_attempted_total`, as before).

The listing itself still **fails closed** — it rejects rather than reporting nobody home, and a
rejection skips the re-announcement (`…reannounce_check_failed_total`). This is deliberate and the
opposite of the ban gate's fail-open: a LiveKit outage coincides with mass reconnects (a WS Connector
deploy reconnects everyone at once), and reading "cannot tell" as "not in the room" would end every
one of those sessions. `dcl_gatekeeper_cluster_reannounce_*` counts each branch so they can be told
apart.

Self-healing (the different-valid-session branch above) depends on the mint always stamping the
session (the pipeline above), which in turn requires the LiveKit deployment to support participant
attributes (introduced in LiveKit server 1.6). Without that support every holder looks attribute-less
and is suppressed — the same behaviour this service had before session-awareness, not a regression.
Verify the deployed version to know which of the two an environment gets.

One more gate precedes that lookup. A `connect` whose session differs from the one the mirror recorded
for the wallet is a displaced device coming back - or that very device signing back in, since Explorer
persists its ephemeral identity and re-handshakes with the same session key it lost. When the mirror
still remembers that session as one it displaced for the wallet before (F4), it MAY be parked instead
(`…reannounce_parked_total`) rather than being handed the room it was just removed from - but only after
the ban gate, and only when LiveKit shows a holder of the wallet's identity still carrying the mirror's
live session (B2): that positive evidence is what tells a leftover displaced device apart from the same
device signing back in, which by then finds no such holder and falls through, exactly like an
unrecognised session, to `…skipped_other_session_total`. A repeated string for a room the client was
just handed is de-duplicated by WS Connector, which knows what it delivered to which socket; gatekeeper
keeps no timing state.

**Known limitations.** A replica that has just started has an empty mirror and cannot answer a
reconnect until each wallet's next genuine cluster change; because the connect subscription is
grouped, a connect routed to such a replica is dropped rather than passed on. Entries also age
out after `CLUSTER_ASSIGNMENT_MIRROR_TTL_MS` (1 h default), so a peer that has stood still
longer than that is unresolvable. Both show up as
`dcl_gatekeeper_cluster_reannounce_unresolved_total`.

**Deploy order.** On clients without the same-island guard in `ArchipelagoIslandRoom`
(unity-explorer, unmerged at the time of writing), being told to join a room they already hold
triggers `DuplicateIdentity`, which stops the reconnection loop for the rest of the session and
shows an exit-only modal. The classification above is what keeps that from happening to the device
genuinely still there, which is why a failed lookup must stay closed.

**Layout:** `src/logic/cluster-subscriber/` orchestrates; the pieces it leans on are components
in their own right — `src/adapters/nats/` (the broker client), `src/adapters/peer-state/` (the
bounded per-wallet assignment store, whose only consumer is `fromIslandId`) and
`src/logic/access-gate/` (the platform-ban + deny-list lookup shared with the two signed-fetch
token handlers). Island room names come from `livekit.getIslandRoomName`, alongside every other
room-name builder in that adapter.

**Room names** are `island-{clusterId}` — one cluster maps to exactly one room. The `island-`
prefix is required so this service's own webhook handlers classify these rooms as
`RoomType.ISLAND` rather than misreading them as scene rooms.

**Not consumed:** `peer.*.heartbeat` and `peer.*.disconnect` survive iteration 1 and still
feed archipelago-stats, but are deliberately unused here — both retire in iteration 2.

**Metrics:** `dcl_gatekeeper_cluster_*_total` (including `dcl_gatekeeper_cluster_takeover_evicted_total`,
`dcl_gatekeeper_cluster_takeover_failed_total`, `dcl_gatekeeper_cluster_takeover_absent_total`,
`dcl_gatekeeper_cluster_takeover_skipped_live_total`, `dcl_gatekeeper_cluster_takeover_parked_total`,
`dcl_gatekeeper_cluster_reannounce_skipped_other_session_total`,
`dcl_gatekeeper_cluster_reannounce_evicted_stale_total`,
`dcl_gatekeeper_cluster_reannounce_stale_evict_failed_total` and
`dcl_gatekeeper_cluster_reannounce_parked_total`)
and `dcl_gatekeeper_nats_connected`.

**Dependency pin (temporary).** `@dcl/protocol` is pinned to the CDN branch tarball
`dcl-protocol-1.0.0-34523473551.commit-3ef4c52.tgz` (which also includes pulse_presence) because no npm registry release yet carries
`proto/decentraland/pulse/pulse_clusters.proto` with the `session`, `displaced_session` and
`displaced_cluster_id` fields. CDN branch tarballs are not permanent: the artifact can vanish
once the source branch is rebuilt or deleted — this is what broke archipelago-workers before it
moved to a registry pin — so `yarn install --frozen-lockfile` in CI and the Docker build would
fail. Repin to an exact registry version as soon as a release carrying `pulse_clusters.proto`
fields 3–5 and pulse_presence lands.

**Deliberate choices — do not "fix" these without reading why:**

- **No re-mint suppression.** Publishing again for a repeated same-cluster event is correct.
  Pulse only re-announces a cluster after forgetting a peer, which means a reconnect that
  needs a fresh token; suppressing it would leave the returning player with no voice room.
- **No room sharding.** One cluster is one room, and this service never subdivides a cluster.
  Cluster sizing is entirely Pulse's responsibility — it publishes `maxPeers: 0` on
  `engine.islands` specifically to advertise that clusters are uncapped, so a locally chosen
  threshold here would contradict the feed. If a cluster grows past what a single LiveKit room
  can carry, that is Pulse's to solve by capping or splitting clusters.
- **Processing is serialized per wallet** (`walletChains` in the component). Without it, two
  events for one wallet can have their mints resolve out of order, so an older event publishes
  a stale room and corrupts the next `fromIslandId`.

**Known limitation.** That serialization is process-local, and queue groups have no per-wallet
affinity, so two events for one wallet can still race across replicas. Narrow trigger (Pulse's
dwell debounce spaces a peer's events ~3 s apart) and self-correcting on the next assignment;
a real fix needs wallet-hash-partitioned consumers. Symptom to watch for: `publish_failed`
clean, but users report being in a voice room whose members they cannot hear.


## Presence map (`/hot-scenes`, `/scene-participants`)

Iteration 2 makes Pulse the only source of online-player information. archipelago-stats is
decommissioned and this service takes over the two routes that answered "who is where".
Behind `PRESENCE_MAP_ENABLED`, default off.

**Consumes**:

| Subject | Payload | Use |
|---|---|---|
| `engine.parcel_changes` | `decentraland.pulse.ParcelChangesBatch` | the presence map; **no queue group** — every replica needs the whole map |

Plus one HTTP read on boot: `GET {PULSE_URL}/peers?all=true`, so the routes can answer before
the first snapshot instead of warming for up to a minute. That read is the all-instances list and
carries no `server_name`, so its entries are *primed*: owned by nobody, taken over by the first
publisher that mentions the wallet, and expiring on `PRESENCE_PRIME_TTL_MS` if none ever does.
`PULSE_URL` is unset in `.env.default` (commented out, not emptied — an empty value satisfies
`requireString`), which is what lets it be required while the map is on: with
`PRESENCE_MAP_ENABLED=true` an absent value, or anything but an absolute `http(s)` URL, fails the
boot instead of becoming a prime that can never work. With the map off nothing reads it.

**Produces** nothing on NATS. Two HTTP routes:

- `GET /hot-scenes` — bare array of at most 100 `HotSceneInfo`, main realm only, ordered by
  `usersTotalCount` descending. Ranking logic ported from archipelago-stats verbatim, including
  that `parcels` lists every parcel of the scene rather than only the occupied ones. Recomputed
  on a timer (`HOT_SCENES_REFRESH_MS`) because the join needs catalyst metadata for every
  occupied tile; `503 {"ok":false,"error":"warming"}` until the first refresh that ran against a
  ready map has completed (`hotScenes.isReady()`, not merely `presenceMap.isReady()` — the map
  flips ready when the prime resolves, and the first sweep runs before that), and again whenever
  the map loses its live source. A sweep over a map that is not ready keeps the previous ranking
  instead of publishing the empty one it would compute, so nothing empty is left waiting to be
  served the moment the map comes back.
- `GET /scene-participants` — unchanged shape, but the answer can now come from either
  implementation, selected by `LIVEKIT_PRESENCE_FALLBACK` (default `true` = LiveKit room
  membership, today's behaviour). `false` resolves it on the map — who is standing on the
  scene's parcels — minus this service's own scene ban list. A cold map is invisible while the
  flag is `true`, because LiveKit is the served answer anyway; with the flag `false` the route
  serves the same `503 {"ok":false,"error":"warming"}` as `/hot-scenes` (one shared
  `PresenceMapWarmingError` / `presenceWarmingResponse` in `src/logic/presence-map/warming.ts`),
  rather than falling back to the implementation the operator switched off.

**Consumer rule (contract C1), the part that matters:** `lastSeq` is kept per `server_name`. On
a sequence gap the publisher is *frozen* and the current state keeps being served until that
publisher's next snapshot (Pulse guarantees one within 60 s). The map is never dropped, because
an empty `/hot-scenes` reads as "Genesis City is deserted" to every caller downstream, which is
a wrong answer rather than a stale one. A snapshot replaces only the entries its own publisher
owns — never the primed ones and never another publisher's — so two Pulse instances cannot erase
each other's peers. A publisher that says nothing at all for `PRESENCE_SERVER_TTL_MS` is presumed
gone: its entries are dropped and its `seq` forgotten, because a retired replica emits no exits and
would otherwise be counted as online for the life of this process — and once no publisher is left,
the map stops reporting itself ready rather than serving what is now an empty map as a fact. A `parcel`-absent entry is the
peer leaving. A `parcel` of `{}` on the wire is the world origin `(0,0)`, **present** — the two
must not collapse into one another. A non-lowercase realm or address violates C1: counted and
logged without the value, never a reason to drop state.

**Layout:** `src/logic/presence-map/` (the map and the subscription), `src/logic/hot-scenes/`
(the timer and the ranking), `src/controllers/handlers/hot-scenes-handler.ts`,
`src/adapters/scene-participants.ts` (both implementations and the shadow comparison), and
`src/logic/world-room-prefix-check/` (the startup guard described below).

**Rollout:** `SHADOW_COMPARE_PRESENCE=true` runs the implementation that is *not* serving as
well and counts the symmetric difference as `presence_shadow_diff{kind=land|world}`, so the
cutover is made on measured agreement. Read it against
`presence_shadow_compare_total{kind}`, which counts the comparisons that actually produced two
answers: a shadow rejecting on every request also leaves the diff at zero, and "the sources agree"
is not the same fact as "the comparison never ran". Counts only — no address ever reaches a log
line or a metric label.

**Metrics:** `dcl_gatekeeper_presence_*` (batches, snapshots, gaps, contract violations, map
size, frozen publishers, `reclaimed_total{reason=prime_expired|server_gone}`) plus the
contract-named `presence_shadow_diff{kind}`, `presence_shadow_compare_total{kind}` and
`presence_prefix_mismatch`.

**World room prefix check.** This service and the worlds content server build a world's LiveKit
room name from independently configured `COMMS_ROOM_PREFIX` values, and the committed defaults
used to disagree (`world-env-` here, `world-` there). Drift does not fail: the room name this
service computes simply does not exist, so `getRoomInfo` returns nothing and every world lookup
answers "nobody is here" for the process's whole life. On start, the check reads the worlds the
content server reports as live (`/live-data`'s `data.perWorld`, falling back to `/status`'s
`comms.details` for deployments whose handler fills it in), computes the expected room name for
a bounded sample of them with `getWorldRoomName`, and asks LiveKit `listRooms(names)` which of
those rooms exist. Live worlds have rooms, so if none of the computed names exists we are
computing the wrong names: that logs an error naming the prefix with a sample world and room and
raises `presence_prefix_mismatch`; one existing room clears it. It never throws and never gates
startup, and "nothing conclusive observed" — no live worlds, fewer than
`MIN_WORLDS_FOR_MISMATCH` (3) sampled, an unreachable content server, an unreachable LiveKit — is
logged with the gauge left at 0 rather than claimed as a mismatch. **Residual risk:** a live world
can be legitimately roomless (`/live-data` lists worlds by name, not by occupancy, so one with
nobody connected is still reported live; a deployment on a non-LiveKit comms adapter has no rooms
at all), so a deployment whose whole sample is roomless still raises the gauge. The three-world
threshold makes that unlikely rather than impossible; the gauge gates nothing, so the cost is a
false alarm on a diagnostic. **Why not the
round trip:** asserting `worldName` -> `getWorldRoomName` -> `substring(prefix.length)` cannot
observe the disagreement it exists for, because the content server publishes world names already
stripped of *its own* prefix, so the trip succeeds by construction whatever our prefix is. Asking
LiveKit is a one-off diagnostic use of the room listing on boot, not a presence read.

**Deliberate choices — do not "fix" these without reading why:**

- **No queue group on `engine.parcel_changes`**, unlike `peer.*.cluster_change`. That feed drives
  an action that must happen exactly once (minting and publishing a token); this one builds local
  state that every replica serves from, so every replica must see every batch.
- **The prime is discarded when a snapshot beats it, but never wiped by one.** A prime still in
  flight when the first snapshot lands is dropped: folding an older HTTP read into a newer snapshot
  would resurrect peers it just retired. A prime that landed first, though, survives every
  publisher's snapshot — `/peers?all=true` is the all-realms *all-instances* list, so the entries a
  snapshot does not mention may well belong to a Pulse whose own snapshot is up to 60 s away, and
  dropping them would report an empty Genesis City. They are owned by nobody until a publisher
  mentions the wallet, and `PRESENCE_PRIME_TTL_MS` (90 s = snapshot interval plus margin) is what
  retires the ones nobody ever claims. Readiness expires with the prime too: an unfed map that has
  outlived it holds nothing real, and answering `503 warming` is honest where `200 []` is not.
- **Readiness tracks liveness, not history.** `presenceMap.isReady()` is true only while a
  publisher that has sent a snapshot has been heard from inside `PRESENCE_SERVER_TTL_MS`, or the
  prime is younger than `PRESENCE_PRIME_TTL_MS`. It is deliberately *not* latched by "a snapshot
  was applied once": the reclaim sweep drops every entry of every silent publisher, so a NATS
  restart or a Pulse roll empties the map while this process keeps running — and a latched
  readiness would then serve `200 []` and an empty address list, "nobody is online" as a fact, for
  as long as the outage lasted. The same sweep that empties the map is the one that un-readies it,
  and the first snapshot after the reconnect makes it ready again. A publisher whose first batch
  was a delta does not count: it is frozen waiting for its snapshot and has told the map nothing.
- **A silent publisher is presumed gone, on `PRESENCE_SERVER_TTL_MS`.** C1 promises a `server_name`
  is stable per *process*, and a scaled-down or replaced replica emits no exits for its peers, so
  nothing else would ever reclaim them (the base branch has the same problem and solves it with
  `CLUSTER_PEER_STATE_TTL_MS`). 150 s is 2.5 snapshot intervals: silence that long is a process
  that is not there, not one that is quiet. Both this and the prime expiry run in one sweep on a
  timer, because neither has any traffic to hang off — the entries that need reclaiming are exactly
  the ones nothing is publishing about.
- **A departure is only honoured from the publisher that owns the entry.** Ordering between two
  Pulse instances is not guaranteed, so a peer reconnecting to another instance can deliver the
  old instance's exit after the new one's placement; honouring it would drop a peer who is very
  much online.
- **`/hot-scenes` keeps the previous ranking when a refresh fails**, and has its own tile cache
  separate from the content client's pointer cache. A city-wide sweep through the shared cache
  would evict the single-scene lookups `/scene-participants` depends on on every refresh.
- **The ban filter fails open.** If the place cannot be resolved the answer is served unfiltered,
  which is exactly what the LiveKit implementation returns today; refusing to answer would be a
  regression against the behaviour being replaced.
