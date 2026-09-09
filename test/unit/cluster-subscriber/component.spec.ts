import { IslandChangedMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import { PeerClusterChange } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { ILoggerComponent, IBaseComponent, START_COMPONENT } from '@well-known-components/interfaces'
import { NatsMessageHandler } from '../../../src/adapters/nats'
import { createPeerStateComponent, IPeerStateComponent } from '../../../src/adapters/peer-state'
import { createClusterSubscriberComponent, IClusterSubscriberComponent } from '../../../src/logic/cluster-subscriber'
import { createAccessGateMockedComponent } from '../../mocks/access-gate-mock'
import { createConfigMockedComponent } from '../../mocks/config-mock'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createMetricsMockedComponent } from '../../mocks/metrics-mock'
import { createNatsMockedComponent } from '../../mocks/nats-mock'
import { createPeerStateMockedComponent } from '../../mocks/peer-state-mock'
import { createPlayerConnectionDBMockedComponent } from '../../mocks/player-connection-db-mock'
import { createFetchMockedComponent } from '../../mocks/fetch-mock'
import { createPresenceMapMockedComponent } from '../../mocks/presence-map-mock'
import { readFixtureJson } from '../../fixtures/iteration-2/loader'
import { createDeferred, flushMacrotask } from '../../utils'

const WALLET = '0x1111111111111111111111111111111111111111'
// Has actual hex letters, unlike WALLET, so upper/lower-casing it is not a no-op.
const MIXED_CASE_WALLET = '0xAaBbCcDdEeFf00112233445566778899aAbBcCdD'
const LOWER_CASE_WALLET = MIXED_CASE_WALLET.toLowerCase()

/** The pack's `GET /realms/main/islands`, the answer the recovery path reads. */
const REALM_ISLANDS = readFixtureJson<{ body: { islands: { id: string; peers: { address: string }[] }[] } }>(
  'http/realms-main-islands.json'
)
/** A wallet the pack's islands answer places in `C2`, in the realm `main`. */
const CLUSTERED_WALLET = '0x0000000000000000000000000000000000000002'
/** Another one it places in `C1`, so a storm can span both islands of the same realm. */
const OTHER_CLUSTERED_WALLET = '0x0000000000000000000000000000000000000001'

/**
 * A fresh `GET /realms/{realm}/islands` response per call, so a test can count how many the
 * component actually issued.
 */
function islandsResponse(): any {
  return { ok: true, status: 200, json: async () => REALM_ISLANDS.body }
}

const startOptions: IBaseComponent.ComponentStartOptions = {
  started: () => true,
  live: () => true,
  getComponents: () => ({})
}

function clusterChange(clusterId: string, realm = 'main'): Uint8Array {
  return PeerClusterChange.encode({ clusterId, realm }).finish()
}

describe('cluster-subscriber component', () => {
  let component: IClusterSubscriberComponent
  let nats: ReturnType<typeof createNatsMockedComponent>
  let metrics: ReturnType<typeof createMetricsMockedComponent>
  let livekit: ReturnType<typeof createLivekitMockedComponent>
  let accessGate: ReturnType<typeof createAccessGateMockedComponent>
  let playerConnectionDb: ReturnType<typeof createPlayerConnectionDBMockedComponent>
  let peerState: IPeerStateComponent
  let presenceMap: ReturnType<typeof createPresenceMapMockedComponent>
  let fetchComponent: ReturnType<typeof createFetchMockedComponent>
  let logger: jest.Mocked<ILoggerComponent.ILogger>

  type BuildOptions = {
    settings?: Record<string, string | undefined>
    numbers?: Record<string, number | undefined>
    natsEnabled?: boolean
    peerStateOverride?: IPeerStateComponent
  }

  /**
   * One subscriber replica, with mocks of its own — `peerState` included, which is what a
   * deployed pod actually has: an in-process LRU no other replica can see, write or invalidate.
   */
  type Replica = {
    component: IClusterSubscriberComponent
    nats: ReturnType<typeof createNatsMockedComponent>
    metrics: ReturnType<typeof createMetricsMockedComponent>
    livekit: ReturnType<typeof createLivekitMockedComponent>
    accessGate: ReturnType<typeof createAccessGateMockedComponent>
    playerConnectionDb: ReturnType<typeof createPlayerConnectionDBMockedComponent>
    peerState: IPeerStateComponent
    presenceMap: ReturnType<typeof createPresenceMapMockedComponent>
    fetch: ReturnType<typeof createFetchMockedComponent>
    logger: jest.Mocked<ILoggerComponent.ILogger>
  }

  async function buildReplica({
    settings = {},
    numbers = {},
    natsEnabled = true,
    peerStateOverride
  }: BuildOptions = {}): Promise<Replica> {
    const values: Record<string, string | undefined> = {
      CLUSTER_SUBSCRIBER_ENABLED: 'true',
      NATS_QUEUE_GROUP: 'comms-gatekeeper-cluster',
      PULSE_URL: 'https://pulse.example.com',
      ...settings
    }
    const config = createConfigMockedComponent({
      getString: jest.fn().mockImplementation((key: string) => Promise.resolve(values[key])),
      getNumber: jest.fn().mockImplementation((key: string) => Promise.resolve(numbers[key]))
    })

    const replicaNats = createNatsMockedComponent({ isEnabled: jest.fn().mockReturnValue(natsEnabled) })
    const replicaMetrics = createMetricsMockedComponent({})
    const replicaLivekit = createLivekitMockedComponent({
      generateCredentials: jest.fn().mockResolvedValue({ url: 'wss://livekit.example', token: 'a-jwt' }),
      buildConnectionUrl: jest.fn((url: string, token: string) => `livekit:${url}?access_token=${token}`)
    })
    const replicaAccessGate = createAccessGateMockedComponent()
    const replicaPlayerConnectionDb = createPlayerConnectionDBMockedComponent({
      getByAddress: jest.fn().mockResolvedValue({ deviceId: 'device-1' })
    })
    const replicaPeerState = peerStateOverride ?? createPeerStateMockedComponent()
    // The default is "the map knows nothing about this wallet", which is also what a map that
    // is switched off answers: the Pulse lookup is unreachable without an entry.
    const replicaPresenceMap = createPresenceMapMockedComponent({ get: jest.fn().mockReturnValue(undefined) })
    const replicaFetch = createFetchMockedComponent({ fetch: jest.fn().mockImplementation(islandsResponse) })
    const logs = createLoggerMockedComponent({})

    const component = await createClusterSubscriberComponent({
      config,
      logs,
      metrics: replicaMetrics,
      nats: replicaNats,
      livekit: replicaLivekit,
      accessGate: replicaAccessGate,
      playerConnectionDb: replicaPlayerConnectionDb,
      peerState: replicaPeerState,
      presenceMap: replicaPresenceMap,
      fetch: replicaFetch
    })

    return {
      component,
      nats: replicaNats,
      metrics: replicaMetrics,
      livekit: replicaLivekit,
      accessGate: replicaAccessGate,
      playerConnectionDb: replicaPlayerConnectionDb,
      peerState: replicaPeerState,
      presenceMap: replicaPresenceMap,
      fetch: replicaFetch,
      // The component fetches its own logger first, synchronously, before its first await, so
      // this is already the cluster-subscriber logger by the time the factory resolves.
      logger: logs.getLogger.mock.results[0].value
    }
  }

  /**
   * Builds the one replica most of this suite works with, publishing its mocks as the shared
   * `let`s above so every test reads them directly.
   */
  async function build(options: BuildOptions = {}): Promise<IClusterSubscriberComponent> {
    const replica = await buildReplica(options)
    ;({ nats, metrics, livekit, accessGate, playerConnectionDb, peerState, presenceMap, logger } = replica)
    fetchComponent = replica.fetch

    return replica.component
  }

  function handlerForNats(
    natsMock: ReturnType<typeof createNatsMockedComponent>,
    subjectFragment: string
  ): NatsMessageHandler {
    const call = natsMock.subscribe.mock.calls.find(([subject]) => String(subject).includes(subjectFragment))
    if (!call) {
      throw new Error(`no subscription matching ${subjectFragment}`)
    }
    return call[1] as NatsMessageHandler
  }

  function handlerFor(subjectFragment: string): NatsMessageHandler {
    return handlerForNats(nats, subjectFragment)
  }

  /** Delivers a `peer.{wallet}.connect` to one specific replica and lets its chain settle. */
  async function deliverConnectTo(replica: Replica, wallet: string): Promise<void> {
    handlerForNats(replica.nats, 'connect')(`peer.${wallet}.connect`, new Uint8Array())
    await flushMacrotask()
  }

  /** The jest mock behind a mocked component method, for a test that has to reset or count it. */
  function asMock(fn: unknown): jest.Mock {
    return fn as jest.Mock
  }

  /** Every increment of one metric, as the label objects the calls carried. */
  function incrementsOf(metricsMock: ReturnType<typeof createMetricsMockedComponent>, metric: string): unknown[][] {
    return metricsMock.increment.mock.calls.filter(([name]) => name === metric).map((call) => call.slice(1))
  }

  /** Delivers an event on the subscribed handler and lets its async chain settle. */
  async function deliver(subject: string, payload: Uint8Array): Promise<void> {
    handlerFor('cluster_change')(subject, payload)
    await flushMacrotask()
  }

  /**
   * Delivers a `peer.{wallet}.connect` and lets its async chain settle. The payload is empty by
   * contract, so the handler must never read it.
   */
  async function deliverConnect(wallet: string): Promise<void> {
    handlerFor('connect')(`peer.${wallet}.connect`, new Uint8Array())
    await flushMacrotask()
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('when the feature flag is off', () => {
    beforeEach(async () => {
      component = await build({ settings: { CLUSTER_SUBSCRIBER_ENABLED: undefined } })
      await component[START_COMPONENT]!(startOptions)
    })

    it('should subscribe to nothing', () => {
      expect(nats.subscribe).not.toHaveBeenCalled()
    })

    it('should not connect', () => {
      expect(nats.connect).not.toHaveBeenCalled()
    })
  })

  describe('when NATS is not configured', () => {
    beforeEach(async () => {
      component = await build({ natsEnabled: false })
      await component[START_COMPONENT]!(startOptions)
    })

    it('should subscribe to nothing', () => {
      expect(nats.subscribe).not.toHaveBeenCalled()
    })

    it('should not connect', () => {
      expect(nats.connect).not.toHaveBeenCalled()
    })
  })

  describe('when enabled', () => {
    beforeEach(async () => {
      component = await build()
      await component[START_COMPONENT]!(startOptions)
    })

    it('should subscribe to cluster_change, queue-grouped', () => {
      expect(nats.subscribe).toHaveBeenCalledWith('peer.*.cluster_change', expect.any(Function), {
        queue: 'comms-gatekeeper-cluster'
      })
    })

    it('should subscribe to connect, queue-grouped too', () => {
      // Queue-grouped for the same reason cluster_change is: one re-emit per connect, not one
      // per replica. A re-send is idempotent for the client, but N tokens for one handshake
      // would still be N messages it has to reconcile.
      expect(nats.subscribe).toHaveBeenCalledWith('peer.*.connect', expect.any(Function), {
        queue: 'comms-gatekeeper-cluster'
      })
    })

    it('should connect', () => {
      expect(nats.connect).toHaveBeenCalled()
    })

    describe('and the queue group is not configured', () => {
      beforeEach(async () => {
        component = await build({ settings: { NATS_QUEUE_GROUP: undefined } })
        await component[START_COMPONENT]!(startOptions)
      })

      it('should subscribe under the default queue group', () => {
        // The queue group must never fall back to undefined: without one, every replica
        // handles every event and each client gets N island_changed messages.
        expect(nats.subscribe).toHaveBeenCalledWith('peer.*.cluster_change', expect.any(Function), {
          queue: 'comms-gatekeeper-cluster'
        })
      })
    })

    describe('and a cluster_change arrives', () => {
      let decoded: IslandChangedMessage

      beforeEach(async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5'))
        decoded = IslandChangedMessage.decode(nats.publish.mock.calls[0][1] as Uint8Array)
      })

      it('should mint a token for the island room', () => {
        expect(livekit.generateCredentials).toHaveBeenCalledWith(WALLET, 'island-C5', { cast: [] }, false)
      })

      it('should publish on the outbound subject', () => {
        expect(nats.publish.mock.calls[0][0]).toBe(`engine.peer.${WALLET}.island_changed`)
      })

      it('should carry the island room as islandId', () => {
        expect(decoded.islandId).toBe('island-C5')
      })

      it('should carry the LiveKit connection string', () => {
        expect(decoded.connStr).toBe('livekit:wss://livekit.example?access_token=a-jwt')
      })

      it('should leave peers empty, since unity-explorer reads only connStr', () => {
        expect(decoded.peers).toEqual({})
      })

      it('should omit fromIslandId on a first assignment', () => {
        expect(decoded.fromIslandId).toBeUndefined()
      })

      it('should count the publish', () => {
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_published_total')
      })
    })

    describe('and the connection string is built', () => {
      beforeEach(async () => {
        component = await build()
        // A sentinel distinct from the real `livekit:{url}?access_token={token}` format:
        // if the component ever went back to hand-rolling the string instead of calling
        // this helper, connStr would show the hand-rolled format instead of this sentinel,
        // and the assertion below would catch the divergence.
        livekit.buildConnectionUrl.mockReturnValue('sentinel-conn-str')
        await component[START_COMPONENT]!(startOptions)

        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5'))
      })

      it('should delegate to livekit.buildConnectionUrl with the minted credentials', () => {
        expect(livekit.buildConnectionUrl).toHaveBeenCalledWith('wss://livekit.example', 'a-jwt')
      })

      it('should put that helper output on the wire rather than a hand-rolled template', () => {
        const decoded = IslandChangedMessage.decode(nats.publish.mock.calls[0][1] as Uint8Array)

        expect(decoded.connStr).toBe('sentinel-conn-str')
      })
    })

    describe('and the wallet arrives upper-cased in the subject', () => {
      beforeEach(async () => {
        await deliver(`peer.${WALLET.toUpperCase()}.cluster_change`, clusterChange('C5'))
      })

      it('should lower-case it, since WS Connector looks peers up exactly', () => {
        expect(nats.publish.mock.calls[0][0]).toBe(`engine.peer.${WALLET}.island_changed`)
      })
    })

    describe('and the wallet arrives with checksum casing in the subject', () => {
      beforeEach(async () => {
        await deliver(`peer.${MIXED_CASE_WALLET}.cluster_change`, clusterChange('C5'))
      })

      it('should lower-case it for the LiveKit identity, not only the publish subject', () => {
        expect(livekit.generateCredentials).toHaveBeenCalledWith(LOWER_CASE_WALLET, 'island-C5', { cast: [] }, false)
      })
    })

    describe('and the same wallet arrives in both mixed and lower case', () => {
      beforeEach(async () => {
        await deliver(`peer.${MIXED_CASE_WALLET}.cluster_change`, clusterChange('C1'))
        await deliver(`peer.${LOWER_CASE_WALLET}.cluster_change`, clusterChange('C2'))
      })

      it('should treat the two forms as one wallet in the ban cache', () => {
        expect(accessGate.getAccessState).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the clusterId is empty', () => {
      // Protobuf decodes an absent cluster_id as ''. Unguarded, the island room name would
      // be `island-`, the same shared room for every wallet whose payload is malformed this way.
      beforeEach(async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange(''))
      })

      it('should mint nothing', () => {
        expect(livekit.generateCredentials).not.toHaveBeenCalled()
      })

      it('should publish nothing', () => {
        expect(nats.publish).not.toHaveBeenCalled()
      })
    })

    describe('and the peer already had an assignment', () => {
      let second: IslandChangedMessage

      beforeEach(async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C2'))
        second = IslandChangedMessage.decode(nats.publish.mock.calls[1][1] as Uint8Array)
      })

      it('should announce the new room', () => {
        expect(second.islandId).toBe('island-C2')
      })

      it('should set fromIslandId to the previous room', () => {
        expect(second.fromIslandId).toBe('island-C1')
      })
    })

    describe('and a slow-to-mint event is still in flight when a newer event for the same wallet arrives', () => {
      let olderMint: ReturnType<typeof createDeferred<{ url: string; token: string }>>

      beforeEach(async () => {
        olderMint = createDeferred<{ url: string; token: string }>()
        livekit.generateCredentials
          .mockImplementationOnce(() => olderMint.promise)
          .mockResolvedValueOnce({ url: 'wss://livekit.example', token: 'newer-jwt' })

        // C-OLD arrives first but stalls minting; C-NEW arrives right behind it. Unserialized,
        // C-NEW's fast mint would finish first and publish, then C-OLD's mint would finish
        // later and overwrite both the client's last message and peerState with itself.
        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C-OLD'))
        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C-NEW'))
        await flushMacrotask()
      })

      it('should not let the queued event start minting while the older one is stuck', () => {
        expect(nats.publish).not.toHaveBeenCalled()
      })

      it('should publish both in arrival order once the older mint completes', async () => {
        olderMint.resolve({ url: 'wss://livekit.example', token: 'older-jwt' })
        await flushMacrotask()

        expect(nats.publish).toHaveBeenCalledTimes(2)
        expect(IslandChangedMessage.decode(nats.publish.mock.calls[0][1] as Uint8Array).islandId).toBe('island-C-OLD')
        expect(IslandChangedMessage.decode(nats.publish.mock.calls[1][1] as Uint8Array).islandId).toBe('island-C-NEW')
      })

      it('should chain the newer event off the older room, not the other way round', async () => {
        olderMint.resolve({ url: 'wss://livekit.example', token: 'older-jwt' })
        await flushMacrotask()

        expect(IslandChangedMessage.decode(nats.publish.mock.calls[1][1] as Uint8Array).fromIslandId).toBe(
          'island-C-OLD'
        )
      })

      it('should chain a later event off the true latest room, not one a stale mint left behind', async () => {
        olderMint.resolve({ url: 'wss://livekit.example', token: 'older-jwt' })
        await flushMacrotask()

        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C-THIRD'))

        expect(IslandChangedMessage.decode(nats.publish.mock.calls[2][1] as Uint8Array).fromIslandId).toBe(
          'island-C-NEW'
        )
      })
    })

    describe('and the same cluster is re-announced', () => {
      beforeEach(async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
      })

      it('should publish again, because the only cause is a reconnect Pulse forgot', () => {
        expect(nats.publish).toHaveBeenCalledTimes(2)
      })
    })

    describe('and a cluster_change for the same cluster arrives after the stored state has actually expired', () => {
      let second: IslandChangedMessage

      beforeEach(async () => {
        // Joins the two halves of the reconnect story: the no-suppression semantics above
        // are exercised against a store that never expires, and peer-state-adapter.spec.ts
        // proves TTL expiry in isolation, but never together. Uses the real peer state
        // adapter with a short TTL rather than its mock, so the expiry is genuine.
        // NOTE: lru-cache v10 does not respect Jest fake timers; using a real, short TTL
        // and a real delay here, matching peer-state-adapter.spec.ts.
        const realPeerState = await createPeerStateComponent({
          config: createConfigMockedComponent({
            getNumber: jest
              .fn()
              .mockImplementation((key: string) =>
                Promise.resolve(key === 'CLUSTER_PEER_STATE_TTL_MS' ? 100 : undefined)
              )
          })
        })
        component = await build({ peerStateOverride: realPeerState })
        await component[START_COMPONENT]!(startOptions)

        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await new Promise((resolve) => setTimeout(resolve, 150))
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))

        second = IslandChangedMessage.decode(nats.publish.mock.calls[1][1] as Uint8Array)
      })

      it('should publish again', () => {
        expect(nats.publish).toHaveBeenCalledTimes(2)
      })

      it('should announce the same room', () => {
        expect(second.islandId).toBe('island-C1')
      })

      it('should omit fromIslandId, exactly as on a first assignment', () => {
        expect(second.fromIslandId).toBeUndefined()
      })
    })

    describe('and the wallet is platform banned', () => {
      beforeEach(async () => {
        accessGate.getAccessState.mockResolvedValue({ isBanned: true, isDenylisted: false })

        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
      })

      it('should mint nothing', () => {
        expect(livekit.generateCredentials).not.toHaveBeenCalled()
      })

      it('should publish nothing', () => {
        expect(nats.publish).not.toHaveBeenCalled()
      })

      it('should count the skip', () => {
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_banned_skipped_total')
      })
    })

    describe('and the wallet is denylisted', () => {
      beforeEach(async () => {
        accessGate.getAccessState.mockResolvedValue({ isBanned: false, isDenylisted: true })

        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
      })

      it('should publish nothing', () => {
        expect(nats.publish).not.toHaveBeenCalled()
      })
    })

    describe('and the ban gate runs for a wallet with recorded connection info', () => {
      beforeEach(async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
      })

      it('should look the wallet up in the connection store', () => {
        expect(playerConnectionDb.getByAddress).toHaveBeenCalledWith(WALLET)
      })

      it('should check the wallet together with its recorded device id', () => {
        expect(accessGate.getAccessState).toHaveBeenCalledWith({ address: WALLET, deviceId: 'device-1' })
      })

      it('should never write connection info, which belongs to the signed-fetch path', () => {
        expect(playerConnectionDb.upsertPlayerConnection).not.toHaveBeenCalled()
      })
    })

    describe('and the wallet has no recorded connection info', () => {
      beforeEach(async () => {
        playerConnectionDb.getByAddress.mockResolvedValue(null)

        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
      })

      it('should pass a null device id', () => {
        expect(accessGate.getAccessState).toHaveBeenCalledWith({ address: WALLET, deviceId: null })
      })
    })

    describe('and a burst of events arrives for one wallet', () => {
      beforeEach(async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C2'))
      })

      it('should cache the ban result rather than re-querying per event', () => {
        expect(accessGate.getAccessState).toHaveBeenCalledTimes(1)
      })

      it('should still publish for every event', () => {
        expect(nats.publish).toHaveBeenCalledTimes(2)
      })
    })

    describe('and two events for the same uncached wallet arrive back-to-back', () => {
      beforeEach(async () => {
        // Fired with no await in between: without per-wallet serialization, both would
        // independently observe a cold banCache and both pay the round trip.
        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C2'))
        await flushMacrotask()
      })

      it('should query the ban check once', () => {
        expect(accessGate.getAccessState).toHaveBeenCalledTimes(1)
      })

      it('should still publish for both', () => {
        expect(nats.publish).toHaveBeenCalledTimes(2)
      })
    })

    describe('and the ban lookup fails once', () => {
      beforeEach(async () => {
        accessGate.getAccessState.mockRejectedValueOnce(new Error('db down'))

        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C2'))
      })

      it('should not cache the failure, so the next event genuinely re-queries it', () => {
        expect(accessGate.getAccessState).toHaveBeenCalledTimes(2)
      })

      it('should fail open and still publish both', () => {
        expect(nats.publish).toHaveBeenCalledTimes(2)
      })
    })

    describe('and the subject carries no wallet token', () => {
      // A subject the wildcard could never produce, but the broker can deliver anything the
      // subscription pattern is loosened to. `split('.')[1]` is undefined here, and an
      // unguarded `.toLowerCase()` on it would throw straight into the client's reader loop.
      beforeEach(async () => {
        await deliver('cluster_change', clusterChange('C1'))
      })

      it('should warn about the subject it could not parse', () => {
        expect(logger.warn).toHaveBeenCalledWith('Cannot extract a wallet from subject cluster_change')
      })

      it('should mint nothing', () => {
        expect(livekit.generateCredentials).not.toHaveBeenCalled()
      })

      it('should publish nothing', () => {
        expect(nats.publish).not.toHaveBeenCalled()
      })
    })

    describe('and the subject has an empty wallet token', () => {
      beforeEach(async () => {
        await deliver('peer..cluster_change', clusterChange('C1'))
      })

      it('should treat it as unparseable rather than minting into a room for the empty wallet', () => {
        expect(nats.publish).not.toHaveBeenCalled()
      })
    })

    describe('and the payload is malformed', () => {
      it('should not throw, so delivery survives', () => {
        const garbage = new Uint8Array([0xff, 0xff, 0xff, 0xff])

        expect(() => handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, garbage)).not.toThrow()
      })
    })

    describe('and the connection goes away while the token is being minted', () => {
      beforeEach(async () => {
        // The adapter discards the write and returns false rather than throwing, so "it did
        // not throw" is not evidence the client ever received anything.
        nats.publish.mockReturnValue(false)

        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
      })

      it('should count the drop as a failure, not as a publish', () => {
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_publish_failed_total')
        expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_published_total')
      })

      it('should log the drop', () => {
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Dropped island_changed'))
      })

      describe('and a later event for the same wallet is delivered normally', () => {
        beforeEach(async () => {
          nats.publish.mockReturnValue(true)
          await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C2'))
        })

        it('should omit fromIslandId, since the dropped room was never announced', () => {
          const decoded = IslandChangedMessage.decode(nats.publish.mock.calls[1][1] as Uint8Array)

          expect(decoded.fromIslandId).toBeUndefined()
        })
      })
    })

    describe('and publishing fails', () => {
      beforeEach(async () => {
        nats.publish.mockImplementation(() => {
          throw new Error('not connected')
        })

        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
      })

      it('should count the failure', () => {
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_publish_failed_total')
      })
    })

    describe('and minting credentials fails', () => {
      let onUnhandledRejection: jest.Mock

      beforeEach(() => {
        livekit.generateCredentials.mockRejectedValue(new Error('livekit unreachable'))
        onUnhandledRejection = jest.fn()
        process.on('unhandledRejection', onUnhandledRejection)
      })

      afterEach(() => {
        process.off('unhandledRejection', onUnhandledRejection)
      })

      it('should not throw out of the handler', () => {
        expect(() => handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))).not.toThrow()
      })

      it('should publish nothing', async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))

        expect(nats.publish).not.toHaveBeenCalled()
      })

      it('should log the failure', async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('livekit unreachable'))
      })

      it('should leave no unhandled rejection behind', async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C1'))

        expect(onUnhandledRejection).not.toHaveBeenCalled()
      })
    })

    /**
     * A9: ws-connector publishes `peer.{address}.connect` after every successful handshake, and
     * this service answers it with the peer's *current* island. A reconnecting WebSocket used to
     * get its room back from the client heartbeat that iteration 2 retires; without this it would
     * sit roomless until Pulse next re-clustered it.
     */
    describe('and a connect arrives', () => {
      describe('and the wallet is one this service already assigned', () => {
        let decoded: IslandChangedMessage

        beforeEach(async () => {
          // Seeded rather than replayed through a cluster_change, so nothing but the connect
          // path can be what publishes here. The map holds nothing for it, which is what makes
          // the local assignment the fallback A9's revision allows.
          peerState.set(WALLET, { clusterId: 'C5', room: 'island-C5', lastSeen: Date.now() })
          asMock(peerState.set).mockClear()
          livekit.generateCredentials.mockResolvedValue({ url: 'wss://livekit.example', token: 'fresh-jwt' })

          await deliverConnect(WALLET)
          decoded = IslandChangedMessage.decode(nats.publish.mock.calls[0][1] as Uint8Array)
        })

        it('should publish exactly one island_changed for it', () => {
          expect(nats.publish).toHaveBeenCalledTimes(1)
          expect(nats.publish.mock.calls[0][0]).toBe(`engine.peer.${WALLET}.island_changed`)
        })

        it('should announce the room it is already in', () => {
          expect(decoded.islandId).toBe('island-C5')
        })

        it('should mint a fresh token rather than replay one', () => {
          // The stored assignment holds no token, and a reconnecting client needs one it can
          // actually use: an expired JWT would leave it connected to nothing.
          expect(livekit.generateCredentials).toHaveBeenCalledWith(WALLET, 'island-C5', { cast: [] }, false)
          expect(decoded.connStr).toBe('livekit:wss://livekit.example?access_token=fresh-jwt')
        })

        it('should omit fromIslandId, because a re-send is not a move', () => {
          expect(decoded.fromIslandId).toBeUndefined()
        })

        it('should never ask Pulse, since nothing had to be recovered', () => {
          expect(fetchComponent.fetch).not.toHaveBeenCalled()
        })

        it('should count the re-send, marked as having come from the local fallback', () => {
          expect(metrics.increment).toHaveBeenCalledWith('island_resend_total', { source: 'peer_state' })
          expect(incrementsOf(metrics, 'island_resend_skipped_total')).toHaveLength(0)
        })

        it('should not write peerState, because only a cluster_change may', () => {
          // A9's revision: a connect never refreshes an entry. Refreshing renews the TTL of an
          // assignment this replica may no longer own, so a flaky client - exactly the
          // population that generates connects - would be re-sent the same room forever.
          expect(peerState.set).not.toHaveBeenCalled()
        })
      })

      describe('and the wallet is unknown but the presence map places it in a realm', () => {
        let decoded: IslandChangedMessage

        beforeEach(async () => {
          presenceMap.get.mockReturnValue({ realm: 'main', parcel: [147, -3] })

          await deliverConnect(CLUSTERED_WALLET)
          decoded = IslandChangedMessage.decode(nats.publish.mock.calls[0][1] as Uint8Array)
        })

        it('should recover the cluster from Pulse for that realm', () => {
          expect(fetchComponent.fetch).toHaveBeenCalledWith('https://pulse.example.com/realms/main/islands')
        })

        it('should announce the room of the island the answer places it in', () => {
          expect(decoded.islandId).toBe('island-C2')
          expect(livekit.generateCredentials).toHaveBeenCalledWith(CLUSTERED_WALLET, 'island-C2', { cast: [] }, false)
        })

        it('should omit fromIslandId here too', () => {
          expect(decoded.fromIslandId).toBeUndefined()
        })

        it('should count the re-send, marked as authoritative', () => {
          expect(metrics.increment).toHaveBeenCalledWith('island_resend_total', { source: 'pulse' })
        })

        it('should not record what it read, because only a cluster_change writes peerState', () => {
          // The store stays the record of what *this* replica was told to publish. A connect
          // reads through it to Pulse instead of teaching it anything.
          expect(peerState.set).not.toHaveBeenCalled()
        })
      })

      describe('and the wallet is unknown and the map places it in a world', () => {
        beforeEach(async () => {
          presenceMap.get.mockReturnValue({ realm: 'cozyfarm.dcl.eth', parcel: [0, 0] })

          await deliverConnect(CLUSTERED_WALLET)
        })

        it('should ask Pulse about that realm, not about main', () => {
          expect(fetchComponent.fetch).toHaveBeenCalledWith('https://pulse.example.com/realms/cozyfarm.dcl.eth/islands')
        })
      })

      describe('and no island in the realm holds the wallet', () => {
        beforeEach(async () => {
          presenceMap.get.mockReturnValue({ realm: 'main', parcel: [147, -3] })

          // Standing in a realm is not the same fact as being clustered: Pulse clusters a peer
          // shortly after it appears, and it will publish that assignment itself. WALLET is not
          // among the addresses the pack's islands answer lists.
          await deliverConnect(WALLET)
        })

        it('should publish nothing', () => {
          expect(nats.publish).not.toHaveBeenCalled()
          expect(livekit.generateCredentials).not.toHaveBeenCalled()
        })

        it('should count the skip as "Pulse says it is in no island"', () => {
          expect(metrics.increment).toHaveBeenCalledWith('island_resend_skipped_total', {
            reason: 'not_clustered'
          })
          expect(incrementsOf(metrics, 'island_resend_total')).toHaveLength(0)
        })
      })

      describe('and Pulse cannot be reached', () => {
        beforeEach(async () => {
          presenceMap.get.mockReturnValue({ realm: 'main', parcel: [147, -3] })
          fetchComponent.fetch.mockRejectedValue(new Error('pulse unreachable'))

          await deliverConnect(CLUSTERED_WALLET)
        })

        it('should publish nothing and count the skip as a failed lookup', () => {
          expect(nats.publish).not.toHaveBeenCalled()
          expect(metrics.increment).toHaveBeenCalledWith('island_resend_skipped_total', {
            reason: 'lookup_failed'
          })
        })

        it('should log the failure rather than throw into the reader loop', () => {
          expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('pulse unreachable'))
        })
      })

      describe('and Pulse cannot be reached but this replica does hold an assignment', () => {
        beforeEach(async () => {
          presenceMap.get.mockReturnValue({ realm: 'main', parcel: [147, -3] })
          fetchComponent.fetch.mockRejectedValue(new Error('pulse unreachable'))
          peerState.set(CLUSTERED_WALLET, { clusterId: 'C9', room: 'island-C9', lastSeen: Date.now() })

          await deliverConnect(CLUSTERED_WALLET)
        })

        it('should fall back to what it remembers rather than leave the peer roomless', () => {
          // Deliberate, and the one case where the local entry is used although the map knows the
          // wallet: with no authoritative answer available, a possibly superseded room beats no
          // answer at all, and Pulse re-publishes the assignment itself once it is back. The
          // label is what separates this from an authoritative re-send on a dashboard.
          expect(IslandChangedMessage.decode(nats.publish.mock.calls[0][1] as Uint8Array).islandId).toBe('island-C9')
          expect(metrics.increment).toHaveBeenCalledWith('island_resend_total', { source: 'peer_state' })
        })
      })

      describe('and Pulse answers with an error status', () => {
        let cancelBody: jest.Mock

        beforeEach(async () => {
          presenceMap.get.mockReturnValue({ realm: 'main', parcel: [147, -3] })
          cancelBody = jest.fn().mockResolvedValue(undefined)
          fetchComponent.fetch.mockResolvedValue({
            ok: false,
            status: 503,
            body: { cancel: cancelBody },
            json: async () => ({})
          } as any)

          await deliverConnect(CLUSTERED_WALLET)
        })

        it('should publish nothing and count the skip as a failed lookup', () => {
          expect(nats.publish).not.toHaveBeenCalled()
          expect(metrics.increment).toHaveBeenCalledWith('island_resend_skipped_total', {
            reason: 'lookup_failed'
          })
        })

        it('should release the response body rather than leaving the socket checked out', () => {
          // Through the repo's cached-fetch component, which cancels it on every error path.
          expect(cancelBody).toHaveBeenCalledTimes(1)
        })
      })

      describe('and nothing knows where the wallet is', () => {
        beforeEach(async () => {
          // The map is off, or on and does not hold this wallet: either way there is no realm to
          // ask Pulse about. Pulse publishes the first assignment when the peer is clustered.
          await deliverConnect(WALLET)
        })

        it('should mint nothing', () => {
          expect(livekit.generateCredentials).not.toHaveBeenCalled()
        })

        it('should publish nothing', () => {
          expect(nats.publish).not.toHaveBeenCalled()
        })

        it('should not ask Pulse about a realm it does not have', () => {
          expect(fetchComponent.fetch).not.toHaveBeenCalled()
        })

        it('should count the skip as "the map does not place it anywhere"', () => {
          expect(metrics.increment).toHaveBeenCalledWith('island_resend_skipped_total', { reason: 'not_in_map' })
        })
      })

      describe('and the wallet is banned', () => {
        beforeEach(async () => {
          accessGate.getAccessState.mockResolvedValue({ isBanned: true, isDenylisted: false })
          peerState.set(WALLET, { clusterId: 'C5', room: 'island-C5', lastSeen: Date.now() })

          await deliverConnect(WALLET)
        })

        it('should mint nothing', () => {
          expect(livekit.generateCredentials).not.toHaveBeenCalled()
        })

        it('should publish nothing', () => {
          expect(nats.publish).not.toHaveBeenCalled()
        })

        it('should count it as a moderation skip, exactly like a cluster_change', () => {
          expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_banned_skipped_total')
          expect(incrementsOf(metrics, 'island_resend_total')).toHaveLength(0)
        })

        it('should also count it in the connect funnel, so the funnel adds up', () => {
          // The moderation counter is shared with the cluster_change path, so it cannot be the
          // banned term of "received = resent + skipped". This label is.
          expect(metrics.increment).toHaveBeenCalledWith('island_resend_skipped_total', { reason: 'banned' })
        })

        it('should never ask Pulse about a wallet it must not answer', () => {
          expect(fetchComponent.fetch).not.toHaveBeenCalled()
        })
      })

      describe('and the wallet arrives with checksum casing in the subject', () => {
        beforeEach(async () => {
          peerState.set(LOWER_CASE_WALLET, { clusterId: 'C5', room: 'island-C5', lastSeen: Date.now() })

          await deliverConnect(MIXED_CASE_WALLET)
        })

        it('should look it up lower-cased, the way every other path stores it', () => {
          expect(nats.publish.mock.calls[0][0]).toBe(`engine.peer.${LOWER_CASE_WALLET}.island_changed`)
        })
      })

      describe('and the subject carries no wallet token', () => {
        beforeEach(async () => {
          handlerFor('connect')('connect', new Uint8Array())
          await flushMacrotask()
        })

        it('should warn and publish nothing', () => {
          expect(logger.warn).toHaveBeenCalledWith('Cannot extract a wallet from subject connect')
          expect(nats.publish).not.toHaveBeenCalled()
        })
      })

      describe('and the payload is not empty', () => {
        beforeEach(async () => {
          peerState.set(WALLET, { clusterId: 'C5', room: 'island-C5', lastSeen: Date.now() })

          // The contract says the payload is empty; the subject carries everything. Bytes that
          // decode as nothing must therefore change nothing, rather than being read and rejected.
          handlerFor('connect')(`peer.${WALLET}.connect`, new Uint8Array([0xff, 0xff, 0xff, 0xff]))
          await flushMacrotask()
        })

        it('should ignore it and re-emit anyway', () => {
          expect(nats.publish).toHaveBeenCalledTimes(1)
          expect(IslandChangedMessage.decode(nats.publish.mock.calls[0][1] as Uint8Array).islandId).toBe('island-C5')
        })
      })

      describe('and a cluster_change for the same wallet is still minting', () => {
        let stalledMint: ReturnType<typeof createDeferred<{ url: string; token: string }>>

        beforeEach(async () => {
          stalledMint = createDeferred<{ url: string; token: string }>()
          livekit.generateCredentials
            .mockImplementationOnce(() => stalledMint.promise)
            .mockResolvedValueOnce({ url: 'wss://livekit.example', token: 'resend-jwt' })

          handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C-NEW'))
          handlerFor('connect')(`peer.${WALLET}.connect`, new Uint8Array())
          await flushMacrotask()
        })

        it('should wait for it rather than re-sending the room it is about to leave', () => {
          expect(nats.publish).not.toHaveBeenCalled()
        })

        it('should then re-send the room that assignment just established', async () => {
          stalledMint.resolve({ url: 'wss://livekit.example', token: 'assignment-jwt' })
          await flushMacrotask()

          expect(nats.publish).toHaveBeenCalledTimes(2)
          const resent = IslandChangedMessage.decode(nats.publish.mock.calls[1][1] as Uint8Array)
          expect(resent.islandId).toBe('island-C-NEW')
          expect(resent.fromIslandId).toBeUndefined()
        })
      })

      describe('and the connection goes away while the re-send is being minted', () => {
        beforeEach(async () => {
          nats.publish.mockReturnValue(false)
          peerState.set(WALLET, { clusterId: 'C5', room: 'island-C5', lastSeen: Date.now() })

          await deliverConnect(WALLET)
        })

        it('should count the drop as a failure, not as a re-send', () => {
          expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_publish_failed_total')
          expect(incrementsOf(metrics, 'island_resend_total')).toHaveLength(0)
        })

        it('should count it in the connect funnel too, so the funnel still adds up', () => {
          expect(metrics.increment).toHaveBeenCalledWith('island_resend_skipped_total', {
            reason: 'publish_failed'
          })
        })
      })
    })
  })

  /**
   * The property no single-component test can reach, and the one A9's revision turns on:
   * `peerState` is an in-process LRU, so the replica a queue-grouped `connect` lands on is
   * generally not the one that recorded that wallet's last assignment - and may be holding one
   * that another replica has since replaced. Two replicas, two `peerState`s, one broker.
   */
  describe('when two replicas share the queue group', () => {
    let stale: Replica
    let current: Replica

    beforeEach(async () => {
      stale = await buildReplica()
      current = await buildReplica()
      await stale.component[START_COMPONENT]!(startOptions)
      await current.component[START_COMPONENT]!(startOptions)
    })

    describe('and each of them recorded a different assignment for one wallet', () => {
      beforeEach(() => {
        // What the queue group actually does: `peer.*.cluster_change` is distributed to one
        // arbitrary member per message, with no affinity to the member that got the last one.
        // `stale` minted island-C1; `current` minted island-C2, which superseded it; nothing
        // told `stale`, because there is no broadcast and no shared store.
        stale.peerState.set(CLUSTERED_WALLET, { clusterId: 'C1', room: 'island-C1', lastSeen: Date.now() })
        current.peerState.set(CLUSTERED_WALLET, { clusterId: 'C2', room: 'island-C2', lastSeen: Date.now() })
        // Both replicas' maps place the wallet in `main`; the pack's islands answer puts it in C2.
        stale.presenceMap.get.mockReturnValue({ realm: 'main', parcel: [147, -3] })
        current.presenceMap.get.mockReturnValue({ realm: 'main', parcel: [147, -3] })
      })

      describe('and the connect is delivered to the one holding the superseded assignment', () => {
        let resent: IslandChangedMessage

        beforeEach(async () => {
          await deliverConnectTo(stale, CLUSTERED_WALLET)
          resent = IslandChangedMessage.decode(stale.nats.publish.mock.calls[0][1] as Uint8Array)
        })

        it('should mint the room the wallet is actually in, not the one it remembers', () => {
          expect(resent.islandId).toBe('island-C2')
          expect(stale.livekit.generateCredentials).toHaveBeenCalledWith(
            CLUSTERED_WALLET,
            'island-C2',
            { cast: [] },
            false
          )
        })

        it('should ask Pulse even though it holds a local assignment', () => {
          expect(stale.fetch.fetch).toHaveBeenCalledWith('https://pulse.example.com/realms/main/islands')
        })

        it('should count the re-send as authoritative', () => {
          expect(stale.metrics.increment).toHaveBeenCalledWith('island_resend_total', { source: 'pulse' })
        })

        it('should leave its superseded entry exactly as it was, TTL included', () => {
          // Renewing it here is what would make the wrong room permanent for a client that
          // keeps reconnecting, so a connect must not write at all.
          expect(stale.peerState.get(CLUSTERED_WALLET)).toEqual(
            expect.objectContaining({ clusterId: 'C1', room: 'island-C1' })
          )
        })

        it('should not have made the other replica do anything', () => {
          expect(current.nats.publish).not.toHaveBeenCalled()
        })
      })

      describe('and the connect is delivered to the one holding the current assignment', () => {
        it('should mint the same room, from the same authoritative read', async () => {
          await deliverConnectTo(current, CLUSTERED_WALLET)

          const resent = IslandChangedMessage.decode(current.nats.publish.mock.calls[0][1] as Uint8Array)
          expect(resent.islandId).toBe('island-C2')
          expect(current.fetch.fetch).toHaveBeenCalledWith('https://pulse.example.com/realms/main/islands')
        })
      })
    })
  })

  /**
   * A9's revision requires the islands read to be cached per realm and de-duplicated in flight:
   * a ws-connector redeploy re-handshakes every connected peer at once, and one full
   * cluster-board read per connect would arrive at Pulse as a second storm.
   */
  describe('when a reconnect storm arrives', () => {
    let replica: Replica

    /** Every address the pack's islands answer lists, i.e. peers Pulse can place. */
    const stormWallets = REALM_ISLANDS.body.islands.flatMap((island) => island.peers.map((peer) => peer.address))

    beforeEach(async () => {
      replica = await buildReplica()
      await replica.component[START_COMPONENT]!(startOptions)
    })

    describe('and every reconnecting peer stands in the same realm', () => {
      beforeEach(async () => {
        replica.presenceMap.get.mockReturnValue({ realm: 'main', parcel: [147, -3] })

        const handler = handlerForNats(replica.nats, 'connect')
        // Delivered without awaiting in between, which is how a broker delivers a storm: every
        // one of these misses the cache at the same moment.
        for (const wallet of stormWallets) {
          handler(`peer.${wallet}.connect`, new Uint8Array())
        }
        await flushMacrotask()
      })

      it('should ask Pulse exactly once, not once per connect', () => {
        expect(replica.fetch.fetch).toHaveBeenCalledTimes(1)
      })

      it('should still answer every one of them', () => {
        expect(replica.nats.publish).toHaveBeenCalledTimes(stormWallets.length)
        expect(incrementsOf(replica.metrics, 'island_resend_total')).toHaveLength(stormWallets.length)
      })

      it('should serve a later reconnect from the cache while it is fresh', async () => {
        await deliverConnectTo(replica, stormWallets[0])

        expect(replica.fetch.fetch).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the reconnecting peers are spread over two realms', () => {
      it('should ask once per realm', async () => {
        replica.presenceMap.get.mockImplementation((wallet: string) => ({
          realm: wallet === CLUSTERED_WALLET ? 'main' : 'cozyfarm.dcl.eth',
          parcel: [0, 0]
        }))

        const handler = handlerForNats(replica.nats, 'connect')
        for (const wallet of stormWallets) {
          handler(`peer.${wallet}.connect`, new Uint8Array())
        }
        await flushMacrotask()

        expect(replica.fetch.fetch).toHaveBeenCalledTimes(2)
        expect(replica.fetch.fetch).toHaveBeenCalledWith('https://pulse.example.com/realms/main/islands')
        expect(replica.fetch.fetch).toHaveBeenCalledWith('https://pulse.example.com/realms/cozyfarm.dcl.eth/islands')
      })
    })

    describe('and the cache entry has expired', () => {
      it('should read Pulse again rather than answer from a stale board', async () => {
        // 1 ms rather than the 2 s default, so the expiry is real time and not a faked clock.
        replica = await buildReplica({ numbers: { CLUSTER_ISLANDS_CACHE_TTL_MS: 1 } })
        await replica.component[START_COMPONENT]!(startOptions)
        replica.presenceMap.get.mockReturnValue({ realm: 'main', parcel: [147, -3] })

        await deliverConnectTo(replica, CLUSTERED_WALLET)
        await new Promise((resolve) => setTimeout(resolve, 20))
        await deliverConnectTo(replica, CLUSTERED_WALLET)

        expect(replica.fetch.fetch).toHaveBeenCalledTimes(2)
      })
    })

    /**
     * Finding 7 of round 3: an operator has to be able to compute what fraction of handshakes
     * got an island back, which needs a received counter and the two skip reasons apart.
     */
    describe('and the storm covers every outcome the funnel has', () => {
      let received: number
      let resent: number
      let skipped: number

      beforeEach(async () => {
        const handler = handlerForNats(replica.nats, 'connect')

        // 1. answered from Pulse; 2. banned; 3. Pulse places it in no island; 4. not in the map.
        replica.presenceMap.get.mockImplementation((wallet: string) =>
          wallet === WALLET ? undefined : { realm: 'main', parcel: [147, -3] }
        )
        replica.accessGate.getAccessState.mockImplementation(async ({ address }: { address: string }) => ({
          isBanned: address === OTHER_CLUSTERED_WALLET,
          isDenylisted: false
        }))

        for (const wallet of [CLUSTERED_WALLET, OTHER_CLUSTERED_WALLET, MIXED_CASE_WALLET, WALLET]) {
          handler(`peer.${wallet}.connect`, new Uint8Array())
        }
        await flushMacrotask()

        received = incrementsOf(replica.metrics, 'dcl_gatekeeper_cluster_connect_events_received_total').length
        resent = incrementsOf(replica.metrics, 'island_resend_total').length
        skipped = incrementsOf(replica.metrics, 'island_resend_skipped_total').length
      })

      it('should count every connect it received', () => {
        expect(received).toBe(4)
      })

      it('should account for each of them exactly once', () => {
        expect(resent + skipped).toBe(received)
      })

      it('should keep the skip reasons apart', () => {
        expect(incrementsOf(replica.metrics, 'island_resend_skipped_total')).toEqual(
          expect.arrayContaining([[{ reason: 'banned' }], [{ reason: 'not_clustered' }], [{ reason: 'not_in_map' }]])
        )
      })
    })
  })
})
