# Comms Gatekeeper

[![Coverage Status](https://coveralls.io/repos/github/decentraland/comms-gatekeeper/badge.svg?branch=main)](https://coveralls.io/github/decentraland/comms-gatekeeper?branch=main)

The comms-gatekeeper service acts as the guardian of LiveKit tokens within Decentraland's communication architecture. It processes signed fetch requests from clients and generates tokens that grant access to LiveKit rooms dedicated to specific scenes or worlds. Notably, LiveKit rooms for [Archipelago](https://github.com/decentraland/archipelago-workers) follow a separate communication channel, ensuring proper routing and isolation.

This server interacts with LiveKit for voice communication, PostgreSQL for scene administration and streaming access management, and various Decentraland services (Catalyst, Places API, Social Service) in order to provide users with secure access to communication channels and streaming capabilities.

## Table of Contents

- [Features](#features)
- [Dependencies & Related Services](#dependencies--related-services)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Running the Service](#running-the-service)
- [Testing](#testing)
- [How to Contribute](#how-to-contribute)
- [License](#license)

## Features

- **LiveKit Token Generation**: Generates secure tokens for LiveKit rooms dedicated to specific scenes or worlds
- **Scene Administration**: Manages scene admins who can control access and moderation
- **Streaming Access Management**: Provides RTMP streaming URLs and keys for content creators
- **Voice Chat Management**: Supports private voice chat sessions and community voice chat with moderation
- **Scene Banning System**: Enables scene admins to ban users from specific scenes
- **Request-to-Speak**: Implements moderated voice chat with speaker management
- **Privacy Controls**: Manages user privacy settings and access control

## Dependencies & Related Services

This service interacts with the following services:

- **[Archipelago Workers](https://github.com/decentraland/archipelago-workers)**: Separate communication channel for Archipelago rooms
- **[Catalyst](https://github.com/decentraland/catalyst)**: Content server for scene metadata and validation
- **[Places API](https://github.com/decentraland/places-api)**: Scene and place information
- **[Social Service](https://github.com/decentraland/social-service-ea)**: User relationships and social data

External dependencies:

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

## Database Schema

See [docs/database-schemas.md](docs/database-schemas.md) for detailed schema, column definitions, and relationships.

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

The service uses environment variables for configuration. Create a `.env` file in the root directory following the ones defined in the `.env.default` file.

Key configuration variables include:

- `PG_COMPONENT_PSQL_CONNECTION_STRING`: PostgreSQL connection string
- `LIVEKIT_HOST`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: LiveKit configuration
- `CATALYST_URL`: Catalyst content server URL
- `PLACES_API_URL`: Places API endpoint
- `SOCIAL_SERVICE_URL`: Social service endpoint
- `AWS_SNS_ARN`: SNS topic ARN for event notifications

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

### Database Migrations

The service uses `node-pg-migrate` for database migrations. Migrations are located in `src/migrations/`.

To run migrations:

```bash
yarn migrate up
```

To rollback migrations:

```bash
yarn migrate down
```

For more information, check the [node-pg-migrate documentation](https://salsita.github.io/node-pg-migrate/).

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

---

**Note**: This service is critical for Decentraland's communication infrastructure. Ensure LiveKit is properly configured and accessible before running the service.
