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

1. **Pulse cluster feed → comms-gatekeeper → LiveKit (NATS):** Pulse owns peer clustering and publishes each peer's cluster assignment on `peer.{addr}.cluster_change`. This service's cluster subscriber (see below) consumes that feed, mints the LiveKit token itself, and re-publishes the legacy `island_changed` message — `connStr` is a LiveKit connection string with an embedded token (`livekit:{host}?access_token={jwt}`) — on `engine.peer.{addr}.island_changed`, which WS Connector forwards to the client unchanged. This token grants access to the island room. This replaces the hop Archipelago Core used to own; Archipelago Core is being decommissioned.

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
| `peer.{addr}.cluster_change` | `decentraland.pulse.PeerClusterChange` | drives minting; queue-grouped so one replica handles each event |

**Produces** `engine.peer.{addr}.island_changed` (`IslandChangedMessage`) — WS Connector
subscribes to the literal subject and needs no change. `peers` is published empty:
unity-explorer reads only `connStr`.

**Pipeline:** decode → wallet-or-device ban check plus deny list, fail-open, 30 s cache →
room name → `generateCredentials(wallet, room, { cast: [] }, false)` → publish.

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

**Metrics:** `dcl_gatekeeper_cluster_*_total` and `dcl_gatekeeper_nats_connected`.

**Dependency pin (temporary).** `@dcl/protocol` is pinned to a CDN *branch* tarball
(`dcl-protocol-1.0.0-33890257211.commit-7dc9cee.tgz`) because no npm registry release ships
`proto/decentraland/pulse/pulse_clusters.proto` or `pulse_presence.proto` (generated as
`out-js/decentraland/pulse/pulse_clusters.gen` and `pulse_presence.gen`, which the cluster
subscriber and the presence map import). Branch builds are not permanent: the CDN artifact
can vanish once the source branch is rebuilt or deleted, which is exactly what broke
archipelago-workers before it moved to a registry pin. Repin to an exact registry version as
soon as a release containing both `pulse_clusters` and `pulse_presence` lands.

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
  a superseded room and corrupts the next `fromIslandId`.

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

**Produces** nothing on NATS. Two HTTP routes:

- `GET /hot-scenes` — bare array of at most 100 `HotSceneInfo`, main realm only, ordered by
  `usersTotalCount` descending. Ranking logic ported from archipelago-stats verbatim, including
  that `parcels` lists every parcel of the scene rather than only the occupied ones. Recomputed
  on a timer (`HOT_SCENES_REFRESH_MS`) because the join needs catalyst metadata for every
  occupied tile; `503 {"ok":false,"error":"warming"}` until the first refresh that ran against a
  primed map has completed (`hotScenes.isReady()`, not merely `presenceMap.isReady()` — the map
  flips ready when the prime resolves, and the first sweep runs before that).
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
would otherwise be counted as online for the life of this process. A `parcel`-absent entry is the
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
startup, and "nothing observed" — no live worlds, an unreachable content server, an unreachable
LiveKit — is logged with the gauge left at 0 rather than claimed as a mismatch. **Why not the
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
