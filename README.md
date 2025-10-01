# Comms Gatekeeper

[![Coverage Status](https://coveralls.io/repos/github/decentraland/comms-gatekeeper/badge.svg?branch=main)](https://coveralls.io/github/decentraland/comms-gatekeeper?branch=main)

The comms-gatekeeper service acts as the guardian of LiveKit tokens within Decentraland's communication architecture. It processes signed fetch requests from clients and generates tokens that grant access to LiveKit rooms dedicated to specific scenes or worlds. Notably, LiveKit rooms for [Archipelago](https://github.com/decentraland/archipelago-workers) follow a separate communication channel, ensuring proper routing and isolation.

## Getting Started

### Prerequisites

- Node.js (LTS version recommended)
- Yarn package manager
- PostgreSQL database
- Docker and Docker Compose (optional, for containerized setup)

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

### Configuration

The service uses environment variables for configuration. Create a `.env` file in the root directory following the ones defined in the `.env.default` file.

### Starting the Server

1. **Start the PostgreSQL database:**

```bash
docker-compose up
```

2. **Start the application:**

```bash
yarn start:dev
```

### Database Migrations

The service uses `node-pg-migrate` for database migrations. Check the [documentation](https://salsita.github.io/node-pg-migrate/) for more information.

### Development

- **Run tests:** `yarn test`
- **Lint code:** `yarn lint:check`
- **Fix linting issues:** `yarn lint:fix`
