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

**Communication Pattern:** Synchronous HTTP REST API with Signed Fetch authentication (ADR-44)

**Technology Stack:**

- Runtime: Node.js (LTS version)
- Language: TypeScript
- HTTP Framework: @dcl/http-server
- Database: PostgreSQL (via @well-known-components/pg-component)
- Communication: LiveKit Server SDK for token generation and room management
- Component Architecture: @well-known-components (logger, metrics, http-server, pg-component, env-config-provider)

**External Dependencies:**

- **LiveKit**: Real-time voice communication infrastructure for token generation and room management
- **PostgreSQL**: Scene administration, streaming access, voice chat users, and ban records
- **Catalyst**: Content server for scene metadata and validation
- **Places API**: Scene and place information
- **Social Service**: User relationships and social data
- **AWS SNS**: Event notifications for streaming and communication events

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
- **Scene rooms and island rooms**: Controls access to both scene-specific LiveKit rooms (tied to a particular scene/parcel) and island rooms (the dynamic clustering rooms managed by Archipelago). Both require a token from comms-gatekeeper.
- **The enforcement point for Genesis City interaction**: All ban checks, permission checks, and access-control decisions for real-time Genesis City interaction happen here, synchronously, before a token is issued.
- **Scoped to Genesis City**: The Comms Gatekeeper's role applies to Genesis City scenes and islands. For Worlds, the access control gatekeeper role is fulfilled by the Worlds Content Server, which may use a separate LiveKit account/cluster.

**Token issuance in the real-time flow:**

There are two token paths in the real-time layer:

1. **Archipelago Core → LiveKit API (direct):** When a player gets an island assignment from Archipelago Core via the WS Connector, the `island_changed` NATS message already includes a LiveKit connection string with an embedded token (`livekit:{host}?access_token={jwt}`). Archipelago Core calls the LiveKit API directly to generate this token. This token grants access to the island room.

2. **Client → comms-gatekeeper (signed fetch):** For scene-specific rooms and for Hammurabi bots, the caller explicitly requests a token from comms-gatekeeper. This path is used when the `CommsTransportWrapper` adapter is `comms-gatekeeper` (the default for Genesis City scenes). Hammurabi bots authenticate here using `PROCESS_PRIVATE_KEY`.

The ban enforcement that matters for scene access happens at comms-gatekeeper (path 2). Platform bans are checked synchronously at token issuance time on this path.

**Database Schema:**

- **Tables**: `scene_admin` (scene administrators), `scene_stream_access` (streaming URLs and keys), `scene_bans` (banned users), `voice_chat_users` (private voice chat participants), `community_voice_chat_users` (community voice chat with moderation)
- **Key Relationships**: Scene admins manage scenes, streaming access is per scene, bans are per scene, voice chat users are per room
- **Full Documentation**: See [docs/database-schemas.md](docs/database-schemas.md) for detailed schema, column definitions, and relationships

**API Specification:** Full OpenAPI 3.0 spec at [docs/openapi.yaml](docs/openapi.yaml). Endpoint groups:

- **Token issuance** (`/scene-adapter`, `/island-adapter`): generate LiveKit tokens for scene and island rooms — the primary entry point to the platform
- **Scene administration** (`/scene-admin`): add/remove scene admins
- **Moderation** (`/scene-bans`, `/users/{address}/bans`, `/users/{address}/warnings`, `/bans`): ban/unban/warn users at scene scope or platform scope; platform moderation endpoints require the moderator role via Signed Fetch
- **Ban checks for other services** (`/users/{address}/ban-status`, `/worlds/{worldName}/parcels/{baseParcel}/users/{address}/ban-status`): bearer-token endpoints used by worlds-content-server before it issues a world token. The platform one takes an `X-Device-Id` header (not a query parameter — the request logger writes the query string at INFO) and matches a ban on the address **or** the recorded device, so a device ban survives a wallet switch
- **Connection recording for other services** (`/users/{address}/connection-info`): bearer-token endpoint worlds-content-server posts to when issuing a world token. This service records the same info inline on its own token paths; worlds does not pass through those, so without it a worlds-only player would be banned with no device captured
- **Streaming** (`/scene-stream-access`): RTMP URL and key lifecycle for content creators
- **Voice chat** (`/private-voice-chat`, `/community-voice-chat`): session creation, speaker management, request-to-speak
- **Webhooks** (`/livekit-webhook`): receive LiveKit server events (room created/destroyed, participant joined/left)

**Authentication Notes:**

- Most endpoints require Signed Fetch authentication (ADR-44)
- Scene-based requests require scene metadata (sceneId, parcel, realmName) in identity headers
- Explorer-based requests use different identity header format
- Service-to-service communication uses Bearer tokens

