// Test-only environment defaults.
//
// Secrets are intentionally NOT shipped in `.env.default` (that value would end up baked into
// the production image and silently satisfy `config.requireString`). The test suite still needs
// the service-to-service bearer token to exist, so provide a well-known fixture value here.
// `aToken` matches the literal used across the integration specs.
process.env.COMMS_GATEKEEPER_AUTH_TOKEN = process.env.COMMS_GATEKEEPER_AUTH_TOKEN || 'aToken'
