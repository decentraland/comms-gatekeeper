// Test-only environment defaults.
//
// Secrets are intentionally NOT shipped in `.env.default` (that value would end up baked into
// the production image and silently satisfy `config.requireString`). The test suite still needs
// the service-to-service bearer token to exist, so provide a well-known fixture value here.
// `aToken` matches the literal used across the integration specs.
process.env.COMMS_GATEKEEPER_AUTH_TOKEN = process.env.COMMS_GATEKEEPER_AUTH_TOKEN || 'aToken'

// LiveKit credentials, for the same reason. `AccessToken`'s constructor throws synchronously on
// an empty api-key/api-secret, so any spec that exercises the real `livekit` adapter's
// `generateCredentials` (it mints the JWT locally via `AccessToken.toJwt()`, contacting no live
// LiveKit server) needs these to be non-empty. `.env.default` leaves them blank on purpose — the
// real values are a deployment secret. The host is a reserved example domain, not a subdomain of
// any real *.decentraland.org host.
process.env.PROD_LIVEKIT_HOST = process.env.PROD_LIVEKIT_HOST || 'prod.livekit.example.com'
process.env.PROD_LIVEKIT_API_KEY = process.env.PROD_LIVEKIT_API_KEY || 'test-api-key'
process.env.PROD_LIVEKIT_API_SECRET = process.env.PROD_LIVEKIT_API_SECRET || 'test-api-secret'
