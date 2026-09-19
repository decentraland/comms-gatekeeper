import { IslandChangedMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import { PeerClusterChange } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { RoomType } from '@dcl/schemas'
import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { createHmac } from 'crypto'
import { connect, NatsConnection } from 'nats'
import { createNatsComponent } from '../../src/adapters/nats'
import { createClusterSubscriberComponent } from '../../src/logic/cluster-subscriber'
import { IClusterSubscriberComponent } from '../../src/logic/cluster-subscriber/types'
import { INatsComponent } from '../../src/adapters/nats'
import { test } from '../components'
import { createKeyedQueueTestComponent } from '../utils'

// This spec is the only one in the suite that exercises the real `livekit` adapter instead of
// a stub: `generateCredentials` mints a JWT locally via `AccessToken.toJwt()` (HMAC signing, no
// live LiveKit server contacted). The PROD_LIVEKIT_* fixtures that mint needs live in
// test/setup-env.ts, alongside the other test-only environment defaults.
const NATS_TEST_URL = process.env.NATS_TEST_URL || 'localhost:4222'
const BANNED_WALLET = '0x2222222222222222222222222222222222222222'
const ALLOWED_WALLET = '0x3333333333333333333333333333333333333333'
// Distinct wallets per scenario: peerState is the app-level component, shared for the whole
// suite, so reusing one would leak a previous test's assignment into the next fromIslandId.
const REASSIGNED_WALLET = '0x4444444444444444444444444444444444444444'
const QUEUE_GROUP_WALLET = '0x5555555555555555555555555555555555555555'
const RECONNECT_WALLET = '0x7777777777777777777777777777777777777777'
const DENYLISTED_WALLET = '0x6666666666666666666666666666666666666666'
const REBANNED_WALLET = '0x8888888888888888888888888888888888888888'

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

// Optional in the inherited DB-only workflow, explicitly required in cluster-recovery.yml.
// Disabled suites are reported as skipped, never as successful assertions.
const brokerTest: typeof test =
  process.env.NATS_INTEGRATION_REQUIRED === 'true'
    ? test
    : (name, suite) => describe.skip(name, () => test(name, suite))

brokerTest('cluster subscriber against a real NATS broker', ({ components, stubComponents }) => {
  let assignments: Map<string, Uint8Array>
  let publisher: NatsConnection
  let nats: INatsComponent
  let subscriber: IClusterSubscriberComponent
  let received: { subject: string; message: IslandChangedMessage }[]

  beforeEach(async () => {
    if (!(await probeBroker())) throw new Error(`Required NATS broker is not reachable at ${NATS_TEST_URL}`)
    publisher = await connect({ servers: NATS_TEST_URL })
    received = []
    assignments = new Map()
    jest.spyOn(components.livekit, 'holdsParticipant').mockResolvedValue(false)
    publisher.subscribe('peer.*.cluster_assignment', {
      callback: (error, message) => {
        if (error) return
        const assignment = assignments.get(message.subject.split('.')[1])
        const session = Buffer.from(message.data).toString('utf8').toLowerCase()
        const matches = assignment && (!session || PeerClusterChange.decode(assignment).session === session)
        // Non-owners stay silent so another Pulse replica can supply the active assignment.
        if (matches && assignment.length) message.respond(assignment)
      }
    })
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
    // The broker probe can reject before fixture resources are initialized.
    if (!subscriber) return
    await subscriber[STOP_COMPONENT]!()
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
    return {
      nats: replicaNats,
      subscriber: await createClusterSubscriberComponent({
        config,
        logs: components.logs,
        metrics: components.metrics,
        nats: replicaNats,
        livekit: components.livekit,
        accessGate: components.accessGate,
        peerState: components.peerState,
        // One per replica: the queue is process-local state.
        clusterWalletQueue: await createKeyedQueueTestComponent()
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
    publisher.publish(
      `peer.${wallet}.cluster_change`,
      PeerClusterChange.encode({
        clusterId,
        realm: 'main',
        session: '',
        displacedSession: '',
        displacedClusterId: ''
      }).finish()
    )
  }

  describe('when Pulse retains an assignment that gatekeeper never received', () => {
    let session: string
    let assignment: Uint8Array
    beforeEach(async () => {
      session = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      assignment = PeerClusterChange.encode(PeerClusterChange.fromPartial({ clusterId: 'recovered', session })).finish()
      assignments.set(RECONNECT_WALLET, assignment)
      jest.spyOn(components.livekit, 'holdsParticipant').mockResolvedValue(false)
      publisher.subscribe(`engine.peer.${RECONNECT_WALLET}.island_changed.${session}`, {
        callback: (error, message) => {
          if (!error) received.push({ subject: message.subject, message: IslandChangedMessage.decode(message.data) })
        }
      })
      await publisher.flush()
    })
    it('should recover after restart through real NATS request/reply', async () => {
      publisher.publish(`peer.${RECONNECT_WALLET}.connect`, Buffer.from(session))
      expect((await nextIslandChanged(5000))?.message.islandId).toBe('island-recovered')
    })
    it('should repair a lost event from a periodic snapshot without reconnecting', async () => {
      publisher.publish(`peer.${RECONNECT_WALLET}.cluster_snapshot`, assignment)
      expect((await nextIslandChanged(5000))?.message.islandId).toBe('island-recovered')
    })
    it('should leave a displaced session without credentials when the authority stays silent', async () => {
      publisher.publish(`peer.${RECONNECT_WALLET}.connect`, Buffer.from('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'))
      expect(await nextIslandChanged(2500)).toBeUndefined()
    })
    describe('and the room is already healthy', () => {
      beforeEach(() => {
        jest.spyOn(components.livekit, 'holdsParticipant').mockResolvedValue(true)
      })
      it('should not send replacement credentials', async () => {
        publisher.publish(`peer.${RECONNECT_WALLET}.cluster_snapshot`, assignment)
        expect(await nextIslandChanged(1000)).toBeUndefined()
      })
    })
  })

  describe('when an allowed wallet is assigned to a cluster', () => {
    it('should publish island_changed with a usable LiveKit connection string', async () => {
      assignments.set(
        ALLOWED_WALLET,
        PeerClusterChange.encode(PeerClusterChange.fromPartial({ clusterId: 'C7' })).finish()
      )
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
      // Island tokens are short-lived on purpose (CLUSTER_ISLAND_TOKEN_TTL_SECONDS); other tokens keep five minutes.
      expect(claims.exp - claims.nbf).toBe(60)

      // Pinning the claims above is not enough on its own: a token signed with the wrong
      // key decodes identically and every claim assertion above would still pass. This is
      // the check that actually proves the token verifies against the configured secret.
      expect(verifiesWithSecret(jwt, process.env.PROD_LIVEKIT_API_SECRET!)).toBe(true)
    })

    it('should classify the minted room as an island room', async () => {
      // Classifies the room name this pipeline actually minted, not a hardcoded literal,
      // proving the `island-` prefix `getIslandRoomName` produces is genuinely classifiable by
      // this service's own webhook path — the real reason that prefix exists.
      const clusterId = 'C9'
      assignments.set(
        ALLOWED_WALLET,
        PeerClusterChange.encode(PeerClusterChange.fromPartial({ clusterId: clusterId })).finish()
      )
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
      assignments.set(
        REASSIGNED_WALLET,
        PeerClusterChange.encode(PeerClusterChange.fromPartial({ clusterId: 'C20' })).finish()
      )
      publishClusterChange(REASSIGNED_WALLET, 'C20')
      first = await nextIslandChanged(5000)

      assignments.set(
        REASSIGNED_WALLET,
        PeerClusterChange.encode(PeerClusterChange.fromPartial({ clusterId: 'C21' })).finish()
      )
      publishClusterChange(REASSIGNED_WALLET, 'C21')
      second = await nextIslandChanged(5000)
    })

    it('should announce the first room with no previous one', () => {
      expect(first?.message.islandId).toBe('island-C20')
      expect(first?.message.fromIslandId).toBeUndefined()
    })

    it('should announce the second room', () => {
      expect(second?.message.islandId).toBe('island-C21')
    })

    it('should chain the second island_changed off the first room', () => {
      expect(second?.message.fromIslandId).toBe('island-C20')
    })
  })

  describe('when a second replica is subscribed in the same queue group', () => {
    let secondNats: INatsComponent
    let secondSubscriber: IClusterSubscriberComponent

    beforeEach(async () => {
      ;({ nats: secondNats, subscriber: secondSubscriber } = await buildReplica())
      await secondSubscriber[START_COMPONENT]!(startOptions)
      await waitForConnected(secondNats, 2000)
    })

    afterEach(async () => {
      await secondNats[STOP_COMPONENT]!()
    })

    it('should have exactly one replica mint and publish, not both', async () => {
      // The property the queue group exists for, and the one a unit test cannot reach: it can
      // assert the `{ queue }` option was passed, but only a real broker proves the group
      // actually divides the work. Without it every replica mints, and the client receives N
      // island_changed messages carrying N different tokens for one assignment.
      assignments.set(
        QUEUE_GROUP_WALLET,
        PeerClusterChange.encode(PeerClusterChange.fromPartial({ clusterId: 'C30' })).finish()
      )
      publishClusterChange(QUEUE_GROUP_WALLET, 'C30')

      expect(await nextIslandChanged(5000)).toBeDefined()
      expect(await nextIslandChanged(1500)).toBeUndefined()
    })

    it('should answer a reconnect exactly once, naming the latest cluster', async () => {
      // The replicas have independent local state. Both resolve the same current authority,
      // and the queue group ensures only one responds to this connect.
      assignments.set(
        RECONNECT_WALLET,
        PeerClusterChange.encode(PeerClusterChange.fromPartial({ clusterId: 'C40' })).finish()
      )
      publishClusterChange(RECONNECT_WALLET, 'C40')
      expect((await nextIslandChanged(5000))?.message.islandId).toBe('island-C40')

      assignments.set(
        RECONNECT_WALLET,
        PeerClusterChange.encode(PeerClusterChange.fromPartial({ clusterId: 'C41' })).finish()
      )
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
      assignments.set(
        ALLOWED_WALLET,
        PeerClusterChange.encode(PeerClusterChange.fromPartial({ clusterId: '' })).finish()
      )
      publishClusterChange(ALLOWED_WALLET, '')

      expect(await nextIslandChanged(2500)).toBeUndefined()
    })
  })

  describe('when the wallet is platform banned', () => {
    it('should publish nothing at all', async () => {
      await components.userModeration.banPlayer(BANNED_WALLET, '0xadmin', 'integration test')

      assignments.set(
        BANNED_WALLET,
        PeerClusterChange.encode(PeerClusterChange.fromPartial({ clusterId: 'C8' })).finish()
      )
      publishClusterChange(BANNED_WALLET, 'C8')

      expect(await nextIslandChanged(2500)).toBeUndefined()
    })
  })

  describe('when the wallet is banned right after an allowed assignment', () => {
    it('should publish nothing for the next assignment', async () => {
      // The ban registry must reflect the ban on the very next event, or a just-banned wallet
      // gets a fresh island token.
      assignments.set(
        REBANNED_WALLET,
        PeerClusterChange.encode(PeerClusterChange.fromPartial({ clusterId: 'C50' })).finish()
      )
      publishClusterChange(REBANNED_WALLET, 'C50')
      expect((await nextIslandChanged(5000))?.message.islandId).toBe('island-C50')

      await components.userModeration.banPlayer(REBANNED_WALLET, '0xadmin', 'integration test')

      assignments.set(
        REBANNED_WALLET,
        PeerClusterChange.encode(PeerClusterChange.fromPartial({ clusterId: 'C51' })).finish()
      )
      publishClusterChange(REBANNED_WALLET, 'C51')

      expect(await nextIslandChanged(2500)).toBeUndefined()
    })
  })

  describe('when the wallet is deny-listed', () => {
    beforeEach(() => {
      // The deny list is a remote JSON feed, so it is stubbed rather than seeded. The gate it
      // feeds is the real access-gate component, reached through the real subscriber.
      stubComponents.denyList.isDenylisted.mockResolvedValue(true)
    })

    it('should publish nothing at all', async () => {
      assignments.set(
        DENYLISTED_WALLET,
        PeerClusterChange.encode(PeerClusterChange.fromPartial({ clusterId: 'C40' })).finish()
      )
      publishClusterChange(DENYLISTED_WALLET, 'C40')

      expect(await nextIslandChanged(2500)).toBeUndefined()
    })
  })
})
