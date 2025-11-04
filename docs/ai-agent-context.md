# AI Agent Context

**Service Purpose:** Generates and validates LiveKit access tokens for Decentraland's communication system. Acts as a security gatekeeper, processing signed fetch requests from clients and issuing tokens that grant access to LiveKit rooms for scene/world communication, with separate handling for Archipelago communication channels.

**Key Capabilities:**

- Validates signed fetch requests (ADR-44) from Decentraland clients
- Generates LiveKit access tokens with appropriate permissions for rooms
- Routes to different LiveKit configurations based on communication type (world/scene vs Archipelago)
- Manages room naming and access control for LiveKit SFU (Selective Forwarding Unit)
- Provides token refresh and validation endpoints

**Communication Pattern:** Synchronous HTTP REST API with authentication

**Technology Stack:**

- Runtime: Node.js (LTS)
- Language: TypeScript
- HTTP Framework: @well-known-components/http-server
- Database: PostgreSQL (token tracking, access logs - via node-pg-migrate)
- Authentication: Signed Fetch validation (ADR-44)
- Component Architecture: @well-known-components (logger, metrics, http-server, pg-component)

**External Dependencies:**

- Communication Service: LiveKit (WebRTC SFU for high-quality communication)
- Databases: PostgreSQL (token management, access tracking)
- Authentication: Ethereum signature validation (Signed Fetch middleware)

**Key Concepts:**

- **LiveKit Rooms**: Isolated communication channels for scenes/worlds
- **Archipelago Isolation**: Separate communication paths for Archipelago protocol (different from world/scene comms)
- **Signed Fetch**: Authentication method following ADR-44 for client verification
