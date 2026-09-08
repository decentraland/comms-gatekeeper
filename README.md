# Comms Gatekeeper

[![Coverage Status](https://coveralls.io/repos/github/decentraland/comms-gatekeeper/badge.svg?branch=main)](https://coveralls.io/github/decentraland/comms-gatekeeper?branch=main)

The comms-gatekeeper service acts as the guardian of LiveKit tokens within Decentraland's communication architecture. It processes signed fetch requests from clients and generates tokens that grant access to LiveKit rooms dedicated to specific scenes or worlds. Notably, LiveKit rooms for [Archipelago](https://github.com/decentraland/archipelago-workers) follow a separate communication channel, ensuring proper routing and isolation.

This server interacts with LiveKit for voice communication, PostgreSQL for scene administration and streaming access management, and various Decentraland services (Catalyst, Places API, Social Service) in order to provide users with secure access to communication channels and streaming capabilities.

## Table of Contents

- [Features](#features)
- [Dependencies](#dependencies)
- [API Documentation](#api-documentation)
- [Database](#database)
  - [Schema](#schema)
  - [Migrations](#migrations)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Running the Service](#running-the-service)
- [Rollout notes](#rollout-notes)
- [Testing](#testing)

## Features

- **LiveKit Token Generation**: Generates secure tokens for LiveKit rooms dedicated to specific scenes or worlds
- **Scene Administration**: Manages scene admins who can control access and moderation
- **Streaming Access Management**: Provides RTMP streaming URLs and keys for content creators
- **Voice Chat Management**: Supports private voice chat sessions and community voice chat with moderation
- **Scene Banning System**: Enables scene admins to ban users from specific scenes
- **Request-to-Speak**: Implements moderated voice chat with speaker management
- **Privacy Controls**: Manages user privacy settings and access control
- **Presence Map**: Keeps the map of where every online player stands, fed by Pulse over NATS, and serves `GET /hot-scenes` and `GET /scene-participants` from it (behind `PRESENCE_MAP_ENABLED` / `LIVEKIT_PRESENCE_FALLBACK`). While no ranking has been computed from a ready map yet, `GET /hot-scenes` answers `503 {"ok":false,"error":"warming"}` (its readiness is its own: the map becomes ready when Pulse's `/peers?all=true` prime resolves, the ranking needs a catalyst sweep on top of that). The map is ready only while a live source stands behind it — a publisher heard from within `PRESENCE_SERVER_TTL_MS`, or a prime younger than `PRESENCE_PRIME_TTL_MS` — so a NATS or Pulse outage that empties it takes both routes back to `503 warming` instead of reporting a deserted world as fact. `GET /scene-participants` instead answers from the LiveKit room lookup for as long as `LIVEKIT_PRESENCE_FALLBACK=true` (the default) — a cold map costs nothing while LiveKit is the served answer anyway — and answers the same `503 warming` once that flag is off, because the operator has then said LiveKit must not answer for that route

- **Island Re-send on Reconnect**: Answers ws-connector's `peer.{address}.connect` by re-minting and re-publishing the peer's current `island_changed`, so a reconnecting WebSocket gets its room back (see "Why a reconnect needs a re-send" below)

## Dependencies

- **[Archipelago Workers](https://github.com/decentraland/archipelago-workers)**: Separate communication channel for Archipelago rooms
- **[Pulse](https://github.com/decentraland/Pulse)**: The source of online-player information. Publishes per-peer cluster assignments and parcel changes over NATS, and serves `GET /peers?all=true`, which this service reads once on boot to prime its presence map, and `GET /realms/{realm}/islands`, which it reads to recover the cluster of a reconnecting peer it has no assignment for
- **[Catalyst](https://github.com/decentraland/catalyst)**: Content server for scene metadata and validation
- **[Places API](https://github.com/decentraland/places-api)**: Scene and place information
- **[Social Service](https://github.com/decentraland/social-service-ea)**: User relationships and social data
- **LiveKit**: Real-time voice communication infrastructure
- **PostgreSQL**: Database for scene administration, streaming access, voice chat users, and bans
- **AWS SNS**: Event notifications for streaming and communication events

## API Documentation

The API is fully documented using the [OpenAPI standard](https://swagger.io/specification/). The schema is located at [docs/openapi.yaml](docs/openapi.yaml).

### Authentication

The API supports three authentication methods:

- **Signed Fetch (Scene)**: Used for scene-based requests from `decentraland-kernel-scene`
- **Signed Fetch (Explorer)**: Used for explorer-based requests from `dcl:explorer`
- **Bearer Token**: Used for service-to-service communication

Most endpoints require Signed Fetch authentication with a complete identity header chain including scene metadata (sceneId, parcel, realmName).

## Database

### Schema

See [docs/database-schemas.md](docs/database-schemas.md) for detailed schema, column definitions, and relationships.

### Migrations

The service uses `node-pg-migrate` for database migrations. These migrations are located in `src/migrations/`. The service automatically runs the migrations when starting up.

#### Create a new migration

Migrations are created by running the create command:

```bash
yarn migrate create name-of-the-migration
```

This will result in the creation of a migration file inside of the `src/migrations/` directory. This migration file MUST contain the migration set up and rollback procedures.

#### Manually applying migrations

If required, these migrations can be run manually.

To run them manually:

```bash
yarn migrate up
```

To rollback them manually:

```bash
yarn migrate down
```

## Getting Started

### Prerequisites

Before running this service, ensure you have the following installed:

- **Node.js**: LTS version recommended (v20.x or higher)
- **Yarn**: Version 1.22.x or higher
- **Docker**: For containerized deployment and local development dependencies
- **PostgreSQL**: Version 14+ (or use Docker Compose)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/decentraland/comms-gatekeeper.git
cd comms-gatekeeper
```

2. Install dependencies:

```bash
yarn install
```

3. Build the project:

```bash
yarn build
```

### Configuration

The service uses environment variables for configuration. Copy the example file and adjust as needed:

```bash
cp .env.default .env
```

See `.env.default` for available configuration options.

`PULSE_URL` is the one key that file documents without defining: `.env.default` ships inside the
image and is a live config source, so a bare `PULSE_URL=` line would resolve to an empty string
that no required-key check can reject. It is commented out instead, which is what lets the boot
require it: while `PRESENCE_MAP_ENABLED=true` an absent value — or anything but an absolute
`http(s)` URL — fails the boot rather than becoming a prime that can never work. With the map off
nothing reads it, so a deployment that runs without the map boots whatever is there.

### Running the Service

#### Setting up the environment

In order to successfully run this server, external dependencies such as databases must be provided.

To do so, this repository provides you with a `docker-compose.yml` file for that purpose. In order to get the environment set up, run:

```bash
docker-compose up -d
```

This will start:
- PostgreSQL database on port `5450`

#### Running in development mode

To run the service in development mode:

```bash
yarn start:dev
```

This will:
- Build the TypeScript code
- Start the server with hot-reload capabilities

For watch mode with automatic rebuilds:

```bash
yarn dev
```

## Rollout notes

### World room names are lower-cased (one-time rename)

`getWorldRoomName` and `getWorldSceneRoomName` now lower-case the world name before building the
LiveKit room name, so this service computes the same names the worlds content server creates. It is
not confined to the presence path: the same helpers build the room a client's **token** is issued
for (`comms-scene-handler`, `comms-server-scene-handler`), the room Cast uses, and the room name the
scene **stream-access** rows persist.

For a world whose name reaches this service in mixed case, that means, at the deploy:

- sessions connected before it stay in `…-MyWorld.dcl.eth-<sceneId>` while everyone admitted after
  it joins `…-myworld.dcl.eth-<sceneId>`; the two rooms cannot hear each other until the old
  sessions drain (they are LiveKit sessions, so minutes, not hours);
- an RTMP stream-access row created before the deploy still points at the old room name, so a live
  stream started before the deploy has to be re-issued to reach the new one.

This is intended, not a regression to flag: the content server already creates the lower-cased room,
so the mixed-case name was a room nobody else was in and every world participant lookup for such a
world answered "nobody is here". Deploy it when a short drain is acceptable, and re-issue any
stream-access key for a mixed-case world afterwards.

### `presence_prefix_mismatch` is a diagnostic, and it can raise a false alarm

On boot the service takes up to 25 of the worlds the worlds content server reports as live,
computes each one's expected LiveKit room name with its own `COMMS_ROOM_PREFIX`, and asks LiveKit
which of those rooms exist. None existing means this service is computing names nobody else uses —
every world participant lookup would answer "nobody is here" forever — so it logs an error naming
both prefixes and sets `presence_prefix_mismatch=1`. One existing room clears it, and so does
anything inconclusive: no live worlds, fewer than three sampled, an unreachable content server or
LiveKit. It never throws and never gates startup.

The residual false positive: a live world can be legitimately roomless. `/live-data` lists worlds
by name rather than by occupancy, so a world with nobody connected is still reported live, and a
deployment whose comms adapter is not LiveKit has no rooms at all. A deployment where *every*
sampled world is roomless therefore raises the gauge with a correct prefix configured. Requiring
three sampled worlds makes that unlikely rather than impossible, so treat the gauge as a prompt to
compare the two `COMMS_ROOM_PREFIX` values — not as proof on its own.

### Why a reconnect needs a re-send

Pulse publishes a cluster assignment when the clustering *changes*, and iteration 2 retires the
client heartbeat that used to hand a reconnecting WebSocket its room back. Between the two, a peer
whose socket dropped while standing still had nothing to tell it which island to rejoin — for a
peer standing still, "the next cluster change" is never.

So ws-connector publishes `peer.{address}.connect` after every successful handshake, and this
service (behind `CLUSTER_SUBSCRIBER_ENABLED`, the same flag as the cluster feed) answers it by
re-minting a token for the peer's **current** island and re-publishing
`engine.peer.{address}.island_changed` for it. The message carries no `fromIslandId`, because a
re-send is not a move, and the token is always freshly minted: a stored one would be expiring
exactly when a reconnecting client needs it. Nothing publishes the subject until ws-connector
starts doing so, so subscribing to it changes nothing on its own.

A wallet this replica holds no assignment for is recovered from the presence map (which realm the
wallet stands in) plus Pulse's `GET /realms/{realm}/islands` (which island of that realm holds it).
With `PRESENCE_MAP_ENABLED` off there is no realm to ask about, so the connect is skipped and
counted on `island_resend_skipped_total` instead of guessed at — Pulse publishes the assignment
itself once the peer is clustered, so the peer waits no longer than it already would. Successful
re-sends count `island_resend_total`; banned wallets are skipped exactly like a cluster change.

## Testing

This service includes comprehensive test coverage with both unit and integration tests.

### Running Tests

Run all tests with coverage:

```bash
yarn test
```

Run tests in watch mode:

```bash
yarn test --watch
```

Run only unit tests:

```bash
yarn test test/unit
```

Run only integration tests:

```bash
yarn test test/integration
```

### Test Structure

- **Unit Tests** (`test/unit/`): Test individual components and functions in isolation
- **Integration Tests** (`test/integration/`): Test the complete request/response cycle

For detailed testing guidelines and standards, refer to our [Testing Standards](https://github.com/decentraland/docs/tree/main/development-standards/testing-standards) documentation.

### Development

- **Run tests:** `yarn test`
- **Lint code:** `yarn lint:check`
- **Fix linting issues:** `yarn lint:fix`

## AI Agent Context

For detailed AI Agent context, see [docs/ai-agent-context.md](docs/ai-agent-context.md).

### AI Skills

This project uses [skills](https://skills.sh/docs) to manage AI agent standards from [decentraland/ai-toolkit](https://github.com/decentraland/ai-toolkit). See the `skills-lock.json` file for installed skills.

---

**Note**: This service is critical for Decentraland's communication infrastructure. Ensure LiveKit is properly configured and accessible before running the service.
