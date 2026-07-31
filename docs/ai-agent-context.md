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
- **Platform Ban (global ban)**: A platform-level ban permanently blocks a user from obtaining any LiveKit token from comms-gatekeeper. Because a token is required to enter any Genesis City room, a platform-banned user is effectively excluded from all real-time interaction in Genesis City. Bans are stored in the `scene_bans` table (scene-scoped) and enforced synchronously at token issuance time — the request is rejected before any LiveKit call is made.

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

**Authentication Notes:**

- Most endpoints require Signed Fetch authentication (ADR-44)
- Scene-based requests require scene metadata (sceneId, parcel, realmName) in identity headers
- Explorer-based requests use different identity header format
- Service-to-service communication uses Bearer tokens

## Cluster subscriber (island rooms)

Replaces the one hop `archipelago-core` owned. Pulse clusters peers; this service turns an
assignment into a LiveKit connection string. Behind `CLUSTER_SUBSCRIBER_ENABLED`, default off.

**Consumes** (subjects prefixed with `NATS_SUBJECT_PREFIX`, matching Pulse's `Nats:SubjectPrefix`):

| Subject | Payload | Use |
|---|---|---|
| `peer.{addr}.cluster_change` | `decentraland.pulse.PeerClusterChange` | drives minting; queue-grouped so one replica handles each event |

**Produces** `engine.peer.{addr}.island_changed` (`IslandChangedMessage`), **unprefixed** —
WS Connector subscribes to the literal subject and needs no change. `peers` is published
empty: unity-explorer reads only `connStr`.

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
(`dcl-protocol-1.0.0-30550755753.commit-b0705a3.tgz`) because no npm registry release ships
`proto/decentraland/pulse/pulse_clusters.proto` (generated as
`out-js/decentraland/pulse/pulse_clusters.gen`, which the subscriber imports) — newest release
checked: `1.0.0-30376440685.commit-2726089`. Branch builds are not permanent: the CDN artifact
can vanish once the source branch is rebuilt or deleted, which is exactly what broke
archipelago-workers before it moved to a registry pin. Repin to an exact registry version as
soon as a release containing `pulse_clusters` lands.

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

