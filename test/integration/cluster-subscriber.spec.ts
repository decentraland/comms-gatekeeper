import { IslandChangedMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import { PeerClusterChange } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { RoomType } from '@dcl/schemas'
import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { createHmac } from 'crypto'
import { connect, NatsConnection } from 'nats'
import { createAssignmentMirrorComponent } from '../../src/adapters/assignment-mirror'
import { createNatsComponent } from '../../src/adapters/nats'
import { createClusterSubscriberComponent } from '../../src/logic/cluster-subscriber'
import { IClusterSubscriberComponent } from '../../src/logic/cluster-subscriber/types'
import { INatsComponent } from '../../src/adapters/nats'
import { test } from '../components'

// This spec is the only one in the suite that exercises the real `livekit` adapter instead of
// a stub: `generateCredentials` mints a JWT locally via `AccessToken.toJwt()` (HMAC signing, no
// live LiveKit server contacted). The PROD_LIVEKIT_* fixtures that mint needs live in
// test/setup-env.ts, alongside the other test-only environment defaults.
const NATS_TEST_URL = 'localhost:4222'
const BANNED_WALLET = '0x2222222222222222222222222222222222222222'
const ALLOWED_WALLET = '0x3333333333333333333333333333333333333333'
// Distinct wallets per scenario: peerState is the app-level component, shared for the whole
// suite, so reusing one would leak a previous test's assignment into the next fromIslandId.
const REASSIGNED_WALLET = '0x4444444444444444444444444444444444444444'
const QUEUE_GROUP_WALLET = '0x5555555555555555555555555555555555555555'
const RECONNECT_WALLET = '0x7777777777777777777777777777777777777777'
const DENYLISTED_WALLET = '0x6666666666666666666666666666666666666666'

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

test('cluster subscriber against a real NATS broker', ({ components, stubComponents }) => {
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
    ;({ nats, subscriber } = await buildReplica())

    await subscriber[START_COMPONENT]!(startOptions)
    // start() fires connect() without awaiting it - the connection is established in the
    // background so it can't gate HTTP readiness (src/logic/cluster-subscriber/component.ts) -
    // so a fixed sleep here was a guess, not a guarantee the subscriptions were live before a
    // test publishes to them. Poll the adapter's own readiness instead: fast in the common case,
    // and a clear failure if it never connects.
    await waitForConnected(nats, 2000)
  })

  afterEach(async () => {
    if (!brokerAvailable) {
      return
    }
    await nats[STOP_COMPONENT]!()
    await publisher.drain()
    await components.database.query('DELETE FROM user_bans')
  })

  /**
   * Builds one subscriber replica against the real broker. Every replica shares the same queue
   * group, exactly as N deployed pods would, so a test can stand up a second one and observe
   * how the group divides work between them.
   */
  async function buildReplica(): Promise<{ nats: INatsComponent; subscriber: IClusterSubscriberComponent }> {
    const config = {
      getString: async (key: string) =>
        ({
          CLUSTER_SUBSCRIBER_ENABLED: 'true',
          NATS_URL: NATS_TEST_URL,
          NATS_QUEUE_GROUP: 'comms-gatekeeper-cluster-test'
        })[key],
      // Zeroed rather than left undefined: undefined falls back to the production default
      // (100ms takeover retry), which is not what this file means to exercise.
      getNumber: async (key: string) =>
        ({
          CLUSTER_TAKEOVER_RETRY_DELAY_MS: 0
        })[key],
      requireString: async () => '',
      requireNumber: async () => 0
    } as any

    const replicaNats = await createNatsComponent({ config, logs: components.logs, metrics: components.metrics })
    // One per replica, as in production: the mirror is process-local, and a shared instance
    // would hide whether the un-grouped subscription really reaches every replica.
    const replicaMirror = await createAssignmentMirrorComponent({ config })

    return {
      nats: replicaNats,
      subscriber: await createClusterSubscriberComponent({
        config,
        logs: components.logs,
        metrics: components.metrics,
        nats: replicaNats,
        livekit: components.livekit,
        accessGate: components.accessGate,
        playerConnectionDb: components.playerConnectionDb,
        peerState: components.peerState,
        assignmentMirror: replicaMirror
      })
    }
  }

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

  async function waitForConnected(component: INatsComponent, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (component.isConnected()) {
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
      // proving the `island-` prefix `getIslandRoomName` produces is genuinely classifiable by
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

  describe('when the same wallet is reassigned to a different cluster', () => {
    // Only ever asserted against a mocked store before. Here the assignment round-trips
    // through the real adapter, real protobuf encoding and the real peer state component,
    // which is the combination that actually ships.
    let first: { subject: string; message: IslandChangedMessage } | undefined
    let second: { subject: string; message: IslandChangedMessage } | undefined

    beforeEach(async () => {
      if (!brokerAvailable) {
        return
      }

      publishClusterChange(REASSIGNED_WALLET, 'C20')
      first = await nextIslandChanged(5000)

      publishClusterChange(REASSIGNED_WALLET, 'C21')
      second = await nextIslandChanged(5000)
    })

    it('should announce the first room with no previous one', () => {
      if (!brokerAvailable) {
        return
      }

      expect(first?.message.islandId).toBe('island-C20')
      expect(first?.message.fromIslandId).toBeUndefined()
    })

    it('should announce the second room', () => {
      if (!brokerAvailable) {
        return
      }

      expect(second?.message.islandId).toBe('island-C21')
    })

    it('should chain the second island_changed off the first room', () => {
      if (!brokerAvailable) {
        return
      }

      expect(second?.message.fromIslandId).toBe('island-C20')
    })
  })

  describe('when a second replica is subscribed in the same queue group', () => {
    let secondNats: INatsComponent
    let secondSubscriber: IClusterSubscriberComponent

    beforeEach(async () => {
      if (!brokerAvailable) {
        return
      }

      ;({ nats: secondNats, subscriber: secondSubscriber } = await buildReplica())
      await secondSubscriber[START_COMPONENT]!(startOptions)
      await waitForConnected(secondNats, 2000)
    })

    afterEach(async () => {
      if (!brokerAvailable) {
        return
      }
      await secondNats[STOP_COMPONENT]!()
    })

    it('should have exactly one replica mint and publish, not both', async () => {
      if (!brokerAvailable) {
        return
      }

      // The property the queue group exists for, and the one a unit test cannot reach: it can
      // assert the `{ queue }` option was passed, but only a real broker proves the group
      // actually divides the work. Without it every replica mints, and the client receives N
      // island_changed messages carrying N different tokens for one assignment.
      publishClusterChange(QUEUE_GROUP_WALLET, 'C30')

      expect(await nextIslandChanged(5000)).toBeDefined()
      expect(await nextIslandChanged(1500)).toBeUndefined()
    })

    it('should answer a reconnect exactly once, naming the latest cluster', async () => {
      if (!brokerAvailable) {
        return
      }

      // The property no unit test can reach, and the one this design got wrong first time
      // round. Minting is queue-grouped, so each replica only records the events it was
      // handed: replica A can end up holding C40 while replica B holds C41. When both then
      // answer the same reconnect, the client is told to join two rooms and settles in
      // whichever arrives last - which may be the stale one. Feeding the mirror from an
      // un-grouped subscription is what makes both replicas agree, and grouping the connect
      // is what stops both of them replying.
      publishClusterChange(RECONNECT_WALLET, 'C40')
      expect((await nextIslandChanged(5000))?.message.islandId).toBe('island-C40')

      publishClusterChange(RECONNECT_WALLET, 'C41')
      expect((await nextIslandChanged(5000))?.message.islandId).toBe('island-C41')

      // The real livekit adapter is in play here, and holdsParticipant deliberately rejects
      // rather than reporting absence when it cannot reach LiveKit - which is always, in a
      // test with no LiveKit server. Stub just this lookup; minting stays real.
      jest.spyOn(components.livekit, 'holdsParticipant').mockResolvedValue(false)

      publisher.publish(`peer.${RECONNECT_WALLET}.connect`)

      expect((await nextIslandChanged(5000))?.message.islandId).toBe('island-C41')
      expect(await nextIslandChanged(1500)).toBeUndefined()
    })
  })

  describe('when the clusterId is empty', () => {
    it('should publish nothing rather than minting into a shared "island-" room', async () => {
      if (!brokerAvailable) {
        return
      }

      publishClusterChange(ALLOWED_WALLET, '')

      expect(await nextIslandChanged(2500)).toBeUndefined()
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

  describe('when the wallet is deny-listed', () => {
    beforeEach(() => {
      if (!brokerAvailable) {
        return
      }
      // The deny list is a remote JSON feed, so it is stubbed rather than seeded. The gate it
      // feeds is the real access-gate component, reached through the real subscriber.
      stubComponents.denyList.isDenylisted.mockResolvedValue(true)
    })

    it('should publish nothing at all', async () => {
      if (!brokerAvailable) {
        return
      }

      publishClusterChange(DENYLISTED_WALLET, 'C40')

      expect(await nextIslandChanged(2500)).toBeUndefined()
    })
  })
})
