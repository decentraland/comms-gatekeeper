import { IslandChangedMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import { PeerClusterChange } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { RoomType } from '@dcl/schemas'
import { createHmac } from 'crypto'
import { connect, NatsConnection } from 'nats'
import { createNatsComponent } from '../../src/adapters/nats'
import { createClusterSubscriberComponent } from '../../src/logic/cluster-subscriber'
import { IClusterSubscriberComponent } from '../../src/logic/cluster-subscriber/types'
import { INatsComponent } from '../../src/types/nats.type'
import { test } from '../components'

// This spec is the only one in the suite that exercises the real `livekit` adapter instead
// of a stub: `generateCredentials` mints a JWT locally via `AccessToken.toJwt()` (HMAC
// signing, no live LiveKit server contacted), but its constructor throws synchronously on
// an empty api-key/api-secret. `.env.default` leaves PROD_LIVEKIT_API_KEY/SECRET blank on
// purpose (real values are a deployment secret), and this environment has no local `.env`
// override, so without this the mint throws "api-key and api-secret must be set" before
// ever reaching nats.publish. Same fixture pattern as test/setup-env.ts's
// COMMS_GATEKEEPER_AUTH_TOKEN, scoped to this file only since no other spec needs it.
// The host below is a reserved example domain, not a subdomain of the organisation's real
// *.decentraland.org hosts. Originals are captured here and restored in the `afterAll`
// below so this mutation of process.env does not outlive this file in the Jest worker.
const ORIGINAL_ENV = {
  PROD_LIVEKIT_HOST: process.env.PROD_LIVEKIT_HOST,
  PROD_LIVEKIT_API_KEY: process.env.PROD_LIVEKIT_API_KEY,
  PROD_LIVEKIT_API_SECRET: process.env.PROD_LIVEKIT_API_SECRET
}
process.env.PROD_LIVEKIT_HOST = process.env.PROD_LIVEKIT_HOST || 'prod.livekit.example.com'
process.env.PROD_LIVEKIT_API_KEY = process.env.PROD_LIVEKIT_API_KEY || 'test-api-key'
process.env.PROD_LIVEKIT_API_SECRET = process.env.PROD_LIVEKIT_API_SECRET || 'test-api-secret'

const NATS_TEST_URL = 'localhost:4222'
const BANNED_WALLET = '0x2222222222222222222222222222222222222222'
const ALLOWED_WALLET = '0x3333333333333333333333333333333333333333'

const startOptions = {
  started: () => true,
  live: () => true,
  getComponents: () => ({})
} as any

async function probeBroker(): Promise<boolean> {
  try {
    const probe = await connect({ servers: NATS_TEST_URL, maxReconnectAttempts: 0, timeout: 1500 })
    await probe.close()
    return true
  } catch {
    return false
  }
}

/**
 * Recomputes the HS256 signature over `header.payload` and compares it against the JWT's
 * own signature segment, base64url throughout — proving the token actually verifies
 * against the configured LiveKit secret, not merely that it decodes and its claims look
 * right. Node's built-in `crypto`, no new dependency.
 */
function verifiesWithSecret(jwt: string, secret: string): boolean {
  const [header, payload, signature] = jwt.split('.')
  const expectedSignature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return signature === expectedSignature
}

// This suite talks to a real NATS broker and a real database, so Jest's 5000 ms default is too
// tight - it used to be exactly equal to nextIslandChanged's longest polling ceiling below, so
// Jest could kill the test before the helper ever got a fair shot at its own, clearer failure.
// 15000 ms leaves every poll ceiling in this file (<= 5000 ms) a comfortable, non-adjacent margin.
jest.setTimeout(15000)

test('cluster subscriber against a real NATS broker', ({ components }) => {
  let brokerAvailable = false
  let publisher: NatsConnection
  let nats: INatsComponent
  let subscriber: IClusterSubscriberComponent
  let received: { subject: string; message: IslandChangedMessage }[]

  beforeAll(async () => {
    brokerAvailable = await probeBroker()
    if (!brokerAvailable) {
      // CI's shared apps-with-db-build.yml workflow provisions Postgres but not NATS, so
      // this suite is skipped there rather than failing the build. It must be run locally
      // with `docker-compose up -d nats`.
      console.warn(`NATS is not reachable at ${NATS_TEST_URL}; skipping cluster subscriber integration tests`)
    }
  })

  afterAll(() => {
    // Deletes keys that were originally absent instead of leaving them set to 'undefined',
    // so a later spec in this Jest worker sees the same process.env shape it would have
    // without this file ever having run.
    for (const [key, original] of Object.entries(ORIGINAL_ENV)) {
      if (original === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = original
      }
    }
  })

  beforeEach(async () => {
    if (!brokerAvailable) {
      return
    }

    publisher = await connect({ servers: NATS_TEST_URL })
    received = []
    // Callback-collected into an array rather than async-iterated: these assertions have
    // to prove a message did NOT arrive as well as that one did, and polling a plain
    // array makes both directions unambiguous.
    publisher.subscribe('engine.peer.*.island_changed', {
      callback: (err, message) => {
        if (err) {
          return
        }
        received.push({ subject: message.subject, message: IslandChangedMessage.decode(message.data) })
      }
    })

    const config = {
      getString: async (key: string) =>
        ({
          CLUSTER_SUBSCRIBER_ENABLED: 'true',
          NATS_URL: NATS_TEST_URL,
          NATS_SUBJECT_PREFIX: '',
          NATS_QUEUE_GROUP: 'comms-gatekeeper-cluster-test'
        })[key],
      getNumber: async () => undefined,
      requireString: async () => '',
      requireNumber: async () => 0
    } as any

    nats = await createNatsComponent({ config, logs: components.logs, metrics: components.metrics })
    subscriber = await createClusterSubscriberComponent({
      config,
      logs: components.logs,
      metrics: components.metrics,
      nats,
      livekit: components.livekit,
      userModeration: components.userModeration,
      denyList: components.denyList,
      playerConnectionDb: components.playerConnectionDb
    })

    await subscriber.start!(startOptions)
    // start() fires connect() without awaiting it - the connection is established in the
    // background so it can't gate HTTP readiness (src/logic/cluster-subscriber/component.ts) -
    // so a fixed sleep here was a guess, not a guarantee the subscriptions were live before a
    // test publishes to them. Poll the adapter's own readiness instead: fast in the common case,
    // and a clear failure if it never connects.
    await waitForNatsConnected(2000)
  })

  afterEach(async () => {
    if (!brokerAvailable) {
      return
    }
    await nats.stop!()
    await publisher.drain()
    await components.database.query('DELETE FROM user_bans')
  })

  async function nextIslandChanged(
    timeoutMs: number
  ): Promise<{ subject: string; message: IslandChangedMessage } | undefined> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (received.length > 0) {
        return received.shift()
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return undefined
  }

  async function waitForNatsConnected(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (nats.isConnected()) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error(`NATS adapter did not report isConnected() within ${timeoutMs}ms`)
  }

  function publishClusterChange(wallet: string, clusterId: string): void {
    publisher.publish(`peer.${wallet}.cluster_change`, PeerClusterChange.encode({ clusterId, realm: 'main' }).finish())
  }

  describe('when an allowed wallet is assigned to a cluster', () => {
    it('should publish island_changed with a usable LiveKit connection string', async () => {
      if (!brokerAvailable) {
        return
      }

      publishClusterChange(ALLOWED_WALLET, 'C7')

      const received = await nextIslandChanged(5000)

      expect(received).toBeDefined()
      expect(received!.subject).toBe(`engine.peer.${ALLOWED_WALLET}.island_changed`)
      expect(received!.message.islandId).toBe('island-C7')
      expect(received!.message.peers).toEqual({})

      // The conn string must be `livekit:{host}?access_token={jwt}` with a real JWT.
      const match = received!.message.connStr.match(/^livekit:(.+)\?access_token=(.+)$/)
      expect(match).not.toBeNull()
      const [, host, jwt] = match!
      expect(host).toMatch(/^wss:\/\//)

      const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))
      expect(claims.sub).toBe(ALLOWED_WALLET)
      expect(claims.iss).toBe(process.env.PROD_LIVEKIT_API_KEY)
      expect(claims.video.room).toBe('island-C7')
      expect(claims.video.roomJoin).toBe(true)
      expect(claims.video.roomList).toBe(false)
      expect(claims.video.canPublish).toBe(true)
      expect(claims.video.canSubscribe).toBe(true)
      expect(claims.video.canPublishData).toBe(true)
      expect(claims.video.canUpdateOwnMetadata).toBe(true)
      expect(claims.video.canPublishSources).toEqual(['microphone'])
      expect(claims.exp - claims.nbf).toBe(300)

      // Pinning the claims above is not enough on its own: a token signed with the wrong
      // key decodes identically and every claim assertion above would still pass. This is
      // the check that actually proves the token verifies against the configured secret.
      expect(verifiesWithSecret(jwt, process.env.PROD_LIVEKIT_API_SECRET!)).toBe(true)
    })

    it('should classify the minted room as an island room', async () => {
      if (!brokerAvailable) {
        return
      }

      // Classifies the room name this pipeline actually minted, not a hardcoded literal,
      // proving the `island-` prefix `islandRoomName` produces is genuinely classifiable by
      // this service's own webhook path — the real reason that prefix exists.
      const clusterId = 'C9'
      publishClusterChange(ALLOWED_WALLET, clusterId)

      const received = await nextIslandChanged(5000)

      expect(received).toBeDefined()
      expect(components.livekit.getRoomMetadataFromRoomName(received!.message.islandId)).toEqual({
        islandName: clusterId,
        roomType: RoomType.ISLAND
      })
    })
  })

  describe('when the wallet is platform banned', () => {
    it('should publish nothing at all', async () => {
      if (!brokerAvailable) {
        return
      }

      await components.userModeration.banPlayer(BANNED_WALLET, '0xadmin', 'integration test')

      publishClusterChange(BANNED_WALLET, 'C8')

      expect(await nextIslandChanged(2500)).toBeUndefined()
    })
  })
})
