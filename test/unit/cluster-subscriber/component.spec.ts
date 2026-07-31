import { IslandChangedMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import { PeerClusterChange } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { IBaseComponent } from '@well-known-components/interfaces'
import { createClusterSubscriberComponent } from '../../../src/logic/cluster-subscriber/component'
import { NatsMessageHandler } from '../../../src/types/nats.type'
import { createConfigMockedComponent } from '../../mocks/config-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createMetricsMockedComponent } from '../../mocks/metrics-mock'
import { createNatsMockedComponent } from '../../mocks/nats-mock'

const WALLET = '0x1111111111111111111111111111111111111111'
// Has actual hex letters, unlike WALLET, so upper/lower-casing it is not a no-op.
const MIXED_CASE_WALLET = '0xAaBbCcDdEeFf00112233445566778899aAbBcCdD'
const LOWER_CASE_WALLET = MIXED_CASE_WALLET.toLowerCase()

describe('cluster-subscriber component', () => {
  let nats: ReturnType<typeof createNatsMockedComponent>
  let metrics: ReturnType<typeof createMetricsMockedComponent>
  let livekit: { generateCredentials: jest.Mock; buildConnectionUrl: jest.Mock }
  let userModeration: { getActiveBanForConnection: jest.Mock }
  let denyList: { isDenylisted: jest.Mock }
  let playerConnectionDb: { getByAddress: jest.Mock; upsertPlayerConnection: jest.Mock }
  let logger: { debug: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock; log: jest.Mock }

  const startOptions: IBaseComponent.ComponentStartOptions = {
    started: () => true,
    live: () => true,
    getComponents: () => ({})
  }

  async function build(
    overrides: Record<string, string | undefined> = {},
    numberOverrides: Record<string, number | undefined> = {}
  ) {
    const values: Record<string, string | undefined> = {
      CLUSTER_SUBSCRIBER_ENABLED: 'true',
      NATS_URL: 'localhost:4222',
      NATS_SUBJECT_PREFIX: '',
      NATS_QUEUE_GROUP: 'comms-gatekeeper-cluster',
      ...overrides
    }
    const config = createConfigMockedComponent({
      getString: jest.fn().mockImplementation((key: string) => Promise.resolve(values[key])),
      getNumber: jest.fn().mockImplementation((key: string) => Promise.resolve(numberOverrides[key]))
    })

    nats = createNatsMockedComponent({})
    metrics = createMetricsMockedComponent({})
    livekit = {
      generateCredentials: jest.fn().mockResolvedValue({ url: 'wss://livekit.example', token: 'a-jwt' }),
      buildConnectionUrl: jest.fn((url: string, token: string) => `livekit:${url}?access_token=${token}`)
    }
    userModeration = { getActiveBanForConnection: jest.fn().mockResolvedValue({ isBanned: false }) }
    denyList = { isDenylisted: jest.fn().mockResolvedValue(false) }
    playerConnectionDb = {
      getByAddress: jest.fn().mockResolvedValue({ deviceId: 'device-1' }),
      // Present on the mock precisely so a test can prove the subscriber never calls it.
      upsertPlayerConnection: jest.fn().mockResolvedValue(undefined)
    }
    const logs = createLoggerMockedComponent({})

    const component = await createClusterSubscriberComponent({
      config,
      logs,
      metrics,
      nats,
      livekit,
      userModeration,
      denyList,
      playerConnectionDb
    } as any)
    // The component fetches its logger once, synchronously, before its first await, so
    // this is already populated by the time createClusterSubscriberComponent resolves.
    logger = logs.getLogger.mock.results[0].value

    return component
  }

  function handlerFor(subjectFragment: string): NatsMessageHandler {
    const call = nats.subscribe.mock.calls.find(([subject]) => String(subject).includes(subjectFragment))
    if (!call) {
      throw new Error(`no subscription matching ${subjectFragment}`)
    }
    return call[1] as NatsMessageHandler
  }

  function clusterChange(clusterId: string, realm = 'main'): Uint8Array {
    return PeerClusterChange.encode({ clusterId, realm }).finish()
  }

  /** Lets a test hold a mocked async call open and resolve it on its own schedule. */
  function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((res) => {
      resolve = res
    })
    return { promise, resolve }
  }

  const flush = () => new Promise(setImmediate)

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('when the feature flag is off', () => {
    it('should subscribe to nothing and not connect', async () => {
      const component = await build({ CLUSTER_SUBSCRIBER_ENABLED: undefined })

      await component.start!(startOptions)

      expect(nats.subscribe).not.toHaveBeenCalled()
      expect(nats.connect).not.toHaveBeenCalled()
    })
  })

  describe('when NATS_URL is unset', () => {
    it('should subscribe to nothing and not connect', async () => {
      const component = await build({ NATS_URL: undefined })

      await component.start!(startOptions)

      expect(nats.subscribe).not.toHaveBeenCalled()
      expect(nats.connect).not.toHaveBeenCalled()
    })
  })

  describe('when enabled', () => {
    it('should subscribe to cluster_change, queue-grouped, and connect', async () => {
      const component = await build()

      await component.start!(startOptions)

      expect(nats.subscribe).toHaveBeenCalledWith('peer.*.cluster_change', expect.any(Function), {
        queue: 'comms-gatekeeper-cluster'
      })
      expect(nats.connect).toHaveBeenCalled()
    })

    it('should apply the subject prefix to the inbound subject', async () => {
      const component = await build({ NATS_SUBJECT_PREFIX: 'dev.' })

      await component.start!(startOptions)

      expect(nats.subscribe).toHaveBeenCalledWith('dev.peer.*.cluster_change', expect.any(Function), {
        queue: 'comms-gatekeeper-cluster'
      })
    })

    describe('and a cluster_change arrives for a cluster', () => {
      it('should mint a token and publish island_changed on the unprefixed outbound subject', async () => {
        const component = await build({ NATS_SUBJECT_PREFIX: 'dev.' })
        await component.start!(startOptions)

        handlerFor('cluster_change')(`dev.peer.${WALLET}.cluster_change`, clusterChange('C5'))
        await flush()

        expect(livekit.generateCredentials).toHaveBeenCalledWith(WALLET, 'island-C5', { cast: [] }, false)

        const [subject, payload] = nats.publish.mock.calls[0]
        expect(subject).toBe(`engine.peer.${WALLET}.island_changed`)
        const decoded = IslandChangedMessage.decode(payload as Uint8Array)
        expect(decoded.islandId).toBe('island-C5')
        expect(decoded.connStr).toBe('livekit:wss://livekit.example?access_token=a-jwt')
        expect(decoded.peers).toEqual({})
        expect(decoded.fromIslandId).toBeUndefined()
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_published_total')
      })

      it('should build connStr via livekit.buildConnectionUrl rather than a hand-rolled template', async () => {
        const component = await build()
        // A sentinel distinct from the real `livekit:{url}?access_token={token}` format:
        // if the component ever went back to hand-rolling the string instead of calling
        // this helper, connStr would show the hand-rolled format instead of this sentinel,
        // and the assertion below would catch the divergence.
        livekit.buildConnectionUrl.mockReturnValue('sentinel-conn-str')
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C5'))
        await flush()

        expect(livekit.buildConnectionUrl).toHaveBeenCalledWith('wss://livekit.example', 'a-jwt')
        const decoded = IslandChangedMessage.decode(nats.publish.mock.calls[0][1] as Uint8Array)
        expect(decoded.connStr).toBe('sentinel-conn-str')
      })
    })

    describe('and the wallet arrives with checksum casing in the subject', () => {
      it('should lower-case it, since WS Connector looks peers up exactly', async () => {
        const component = await build()
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET.toUpperCase()}.cluster_change`, clusterChange('C5'))
        await flush()

        expect(nats.publish.mock.calls[0][0]).toBe(`engine.peer.${WALLET}.island_changed`)
      })

      it('should also lower-case it for the LiveKit identity, not only the publish subject', async () => {
        const component = await build()
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${MIXED_CASE_WALLET}.cluster_change`, clusterChange('C5'))
        await flush()

        expect(livekit.generateCredentials).toHaveBeenCalledWith(LOWER_CASE_WALLET, 'island-C5', { cast: [] }, false)
      })

      it('should treat the mixed-case and lower-case forms as one wallet in the ban cache', async () => {
        const component = await build()
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${MIXED_CASE_WALLET}.cluster_change`, clusterChange('C1'))
        await flush()
        handlerFor('cluster_change')(`peer.${LOWER_CASE_WALLET}.cluster_change`, clusterChange('C2'))
        await flush()

        expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the clusterId is empty', () => {
      it('should skip the event instead of minting everyone into the shared "island-" room', async () => {
        // Protobuf decodes an absent cluster_id as ''. Unguarded, islandRoomName('') would
        // produce the room `island-`, the same shared room for every wallet whose payload
        // is malformed this way.
        const component = await build()
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange(''))
        await flush()

        expect(livekit.generateCredentials).not.toHaveBeenCalled()
        expect(nats.publish).not.toHaveBeenCalled()
      })
    })

    describe('and the peer already had an assignment', () => {
      it('should set fromIslandId to the previous room', async () => {
        const component = await build()
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await flush()

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C2'))
        await flush()

        const second = IslandChangedMessage.decode(nats.publish.mock.calls[1][1] as Uint8Array)
        expect(second.islandId).toBe('island-C2')
        expect(second.fromIslandId).toBe('island-C1')
      })
    })

    describe('and a slow-to-mint event is still in flight when a newer event for the same wallet arrives', () => {
      it('should serialize them so the newer mint cannot be overtaken by the older, stale one', async () => {
        const component = await build()
        await component.start!(startOptions)

        const olderMint = createDeferred<{ url: string; token: string }>()
        livekit.generateCredentials
          .mockImplementationOnce(() => olderMint.promise)
          .mockResolvedValueOnce({ url: 'wss://livekit.example', token: 'newer-jwt' })

        // C-OLD arrives first but stalls minting; C-NEW arrives right behind it. Unserialized,
        // C-NEW's fast mint would finish first and publish, then C-OLD's mint would finish
        // later and overwrite both the client's last message and peerState with itself.
        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C-OLD'))
        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C-NEW'))
        await flush()

        // C-NEW must not even start minting yet: it is queued behind C-OLD, which is still stuck.
        expect(nats.publish).not.toHaveBeenCalled()

        olderMint.resolve({ url: 'wss://livekit.example', token: 'older-jwt' })
        await flush()

        expect(nats.publish).toHaveBeenCalledTimes(2)
        const first = IslandChangedMessage.decode(nats.publish.mock.calls[0][1] as Uint8Array)
        const second = IslandChangedMessage.decode(nats.publish.mock.calls[1][1] as Uint8Array)
        expect(first.islandId).toBe('island-C-OLD')
        expect(second.islandId).toBe('island-C-NEW')
        expect(second.fromIslandId).toBe('island-C-OLD')

        // A later event must chain from the true latest room, not one a stale mint left behind.
        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C-THIRD'))
        await flush()
        const third = IslandChangedMessage.decode(nats.publish.mock.calls[2][1] as Uint8Array)
        expect(third.fromIslandId).toBe('island-C-NEW')
      })
    })

    describe('and the same cluster is re-announced', () => {
      it('should publish again, because the only cause is a reconnect Pulse forgot', async () => {
        const component = await build()
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await flush()
        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await flush()

        expect(nats.publish).toHaveBeenCalledTimes(2)
      })
    })

    describe('and a cluster_change for the same cluster arrives after the stored state has actually expired', () => {
      it('should publish again with fromIslandId absent, exactly as on a first assignment', async () => {
        // Joins the two halves of the reconnect story: the no-suppression semantics above
        // are exercised with the store never actually expiring, and peer-state.spec.ts
        // proves TTL expiry in isolation, but never together. Drives real TTL expiry
        // through the store the component builds internally, via the same mocked
        // CLUSTER_PEER_STATE_TTL_MS config path `build` already wires up.
        // NOTE: lru-cache v10 does not respect Jest fake timers; using a real, short TTL
        // and a real delay here, matching peer-state.spec.ts.
        const component = await build({}, { CLUSTER_PEER_STATE_TTL_MS: 100 })
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await flush()

        await new Promise((resolve) => setTimeout(resolve, 150))

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await flush()

        expect(nats.publish).toHaveBeenCalledTimes(2)
        const second = IslandChangedMessage.decode(nats.publish.mock.calls[1][1] as Uint8Array)
        expect(second.islandId).toBe('island-C1')
        expect(second.fromIslandId).toBeUndefined()
      })
    })

    describe('and the wallet is platform banned', () => {
      it('should mint nothing and publish nothing', async () => {
        const component = await build()
        userModeration.getActiveBanForConnection.mockResolvedValue({ isBanned: true })
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await flush()

        expect(livekit.generateCredentials).not.toHaveBeenCalled()
        expect(nats.publish).not.toHaveBeenCalled()
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_banned_skipped_total')
      })
    })

    describe('and the ban gate runs', () => {
      it('should check the wallet together with its recorded device id', async () => {
        const component = await build()
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await flush()

        expect(playerConnectionDb.getByAddress).toHaveBeenCalledWith(WALLET)
        expect(userModeration.getActiveBanForConnection).toHaveBeenCalledWith({
          address: WALLET,
          deviceId: 'device-1'
        })
      })

      it('should pass a null device id when the wallet has no recorded connection info', async () => {
        const component = await build()
        playerConnectionDb.getByAddress.mockResolvedValue(null)
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await flush()

        expect(userModeration.getActiveBanForConnection).toHaveBeenCalledWith({ address: WALLET, deviceId: null })
      })

      it('should never write connection info, which belongs to the signed-fetch path', async () => {
        const component = await build()
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await flush()

        expect(playerConnectionDb.upsertPlayerConnection).not.toHaveBeenCalled()
      })

      it('should cache the result so a burst of events does not re-query per event', async () => {
        const component = await build()
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await flush()
        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C2'))
        await flush()

        expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(1)
        expect(nats.publish).toHaveBeenCalledTimes(2)
      })

      it('should not cache a failed ban check, so the next event genuinely re-queries it', async () => {
        const component = await build()
        userModeration.getActiveBanForConnection.mockRejectedValueOnce(new Error('db down'))
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await flush()
        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C2'))
        await flush()

        expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(2)
        expect(nats.publish).toHaveBeenCalledTimes(2)
      })

      it('should serialize two events for the same uncached wallet, querying the ban check once', async () => {
        const component = await build()
        await component.start!(startOptions)

        // Fired back-to-back with no await in between: without per-wallet serialization,
        // both would independently observe a cold banCache and both pay the round trip.
        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C2'))
        await flush()

        expect(userModeration.getActiveBanForConnection).toHaveBeenCalledTimes(1)
        expect(nats.publish).toHaveBeenCalledTimes(2)
      })
    })

    describe('and the wallet is denylisted', () => {
      it('should publish nothing', async () => {
        const component = await build()
        denyList.isDenylisted.mockResolvedValue(true)
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await flush()

        expect(nats.publish).not.toHaveBeenCalled()
      })
    })

    describe('and the ban lookup fails', () => {
      it('should fail open and still publish', async () => {
        const component = await build()
        userModeration.getActiveBanForConnection.mockRejectedValue(new Error('db down'))
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await flush()

        expect(nats.publish).toHaveBeenCalled()
      })
    })

    describe('and the payload is malformed', () => {
      it('should not throw, so delivery survives', async () => {
        const component = await build()
        await component.start!(startOptions)
        const garbage = new Uint8Array([0xff, 0xff, 0xff, 0xff])

        expect(() => handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, garbage)).not.toThrow()
      })
    })

    describe('and publishing fails', () => {
      it('should count the failure and not throw', async () => {
        const component = await build()
        nats.publish.mockImplementation(() => {
          throw new Error('not connected')
        })
        await component.start!(startOptions)

        handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))
        await flush()

        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_publish_failed_total')
      })
    })

    describe('and minting credentials fails', () => {
      it('should not throw, publish nothing, log the failure, and leave no unhandled rejection', async () => {
        const component = await build()
        livekit.generateCredentials.mockRejectedValue(new Error('livekit unreachable'))
        await component.start!(startOptions)

        const onUnhandledRejection = jest.fn()
        process.on('unhandledRejection', onUnhandledRejection)

        try {
          expect(() => handlerFor('cluster_change')(`peer.${WALLET}.cluster_change`, clusterChange('C1'))).not.toThrow()
          await flush()

          expect(nats.publish).not.toHaveBeenCalled()
          expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('livekit unreachable'))
          expect(onUnhandledRejection).not.toHaveBeenCalled()
        } finally {
          process.off('unhandledRejection', onUnhandledRejection)
        }
      })
    })
  })
})
