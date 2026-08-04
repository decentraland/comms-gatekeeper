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
import { createDeferred, flushMacrotask } from '../../utils'

const WALLET = '0x1111111111111111111111111111111111111111'
// Has actual hex letters, unlike WALLET, so upper/lower-casing it is not a no-op.
const MIXED_CASE_WALLET = '0xAaBbCcDdEeFf00112233445566778899aAbBcCdD'
const LOWER_CASE_WALLET = MIXED_CASE_WALLET.toLowerCase()

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
  let logger: jest.Mocked<ILoggerComponent.ILogger>

  type BuildOptions = {
    settings?: Record<string, string | undefined>
    numbers?: Record<string, number | undefined>
    natsEnabled?: boolean
    peerStateOverride?: IPeerStateComponent
  }

  async function build({
    settings = {},
    numbers = {},
    natsEnabled = true,
    peerStateOverride
  }: BuildOptions = {}): Promise<IClusterSubscriberComponent> {
    const values: Record<string, string | undefined> = {
      CLUSTER_SUBSCRIBER_ENABLED: 'true',
      NATS_QUEUE_GROUP: 'comms-gatekeeper-cluster',
      ...settings
    }
    const config = createConfigMockedComponent({
      getString: jest.fn().mockImplementation((key: string) => Promise.resolve(values[key])),
      getNumber: jest.fn().mockImplementation((key: string) => Promise.resolve(numbers[key]))
    })

    nats = createNatsMockedComponent({ isEnabled: jest.fn().mockReturnValue(natsEnabled) })
    metrics = createMetricsMockedComponent({})
    livekit = createLivekitMockedComponent({
      generateCredentials: jest.fn().mockResolvedValue({ url: 'wss://livekit.example', token: 'a-jwt' }),
      buildConnectionUrl: jest.fn((url: string, token: string) => `livekit:${url}?access_token=${token}`)
    })
    accessGate = createAccessGateMockedComponent()
    playerConnectionDb = createPlayerConnectionDBMockedComponent({
      getByAddress: jest.fn().mockResolvedValue({ deviceId: 'device-1' })
    })
    peerState = peerStateOverride ?? createPeerStateMockedComponent()
    const logs = createLoggerMockedComponent({})

    const built = await createClusterSubscriberComponent({
      config,
      logs,
      metrics,
      nats,
      livekit,
      accessGate,
      playerConnectionDb,
      peerState
    })
    // The component fetches its logger once, synchronously, before its first await, so
    // this is already populated by the time createClusterSubscriberComponent resolves.
    logger = logs.getLogger.mock.results[0].value

    return built
  }

  function handlerFor(subjectFragment: string): NatsMessageHandler {
    const call = nats.subscribe.mock.calls.find(([subject]) => String(subject).includes(subjectFragment))
    if (!call) {
      throw new Error(`no subscription matching ${subjectFragment}`)
    }
    return call[1] as NatsMessageHandler
  }

  /** Delivers an event on the subscribed handler and lets its async chain settle. */
  async function deliver(subject: string, payload: Uint8Array): Promise<void> {
    handlerFor('cluster_change')(subject, payload)
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
  })
})
