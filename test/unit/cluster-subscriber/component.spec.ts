import { IslandChangedMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import { PeerClusterChange } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { ILoggerComponent, IBaseComponent, START_COMPONENT } from '@well-known-components/interfaces'
import { ISLAND_SESSION_ATTRIBUTE } from '../../../src/adapters/livekit'
import { NatsMessageHandler } from '../../../src/adapters/nats'
import { createPeerStateComponent, IPeerStateComponent } from '../../../src/adapters/peer-state'
import { createClusterSubscriberComponent, IClusterSubscriberComponent } from '../../../src/logic/cluster-subscriber'
import { createAccessGateMockedComponent } from '../../mocks/access-gate-mock'
import { createConfigMockedComponent } from '../../mocks/config-mock'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createMetricsMockedComponent } from '../../mocks/metrics-mock'
import { createNatsMockedComponent } from '../../mocks/nats-mock'
import { createAssignmentMirrorMockedComponent } from '../../mocks/assignment-mirror-mock'
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

function clusterChange(
  clusterId: string,
  realm = 'main',
  session = '',
  displaced: Partial<PeerClusterChange> = {}
): Uint8Array {
  return PeerClusterChange.encode({
    clusterId,
    realm,
    session,
    displacedSession: '',
    displacedClusterId: '',
    ...displaced
  }).finish()
}

describe('cluster-subscriber component', () => {
  let component: IClusterSubscriberComponent
  let nats: ReturnType<typeof createNatsMockedComponent>
  let metrics: ReturnType<typeof createMetricsMockedComponent>
  let livekit: ReturnType<typeof createLivekitMockedComponent>
  let accessGate: ReturnType<typeof createAccessGateMockedComponent>
  let playerConnectionDb: ReturnType<typeof createPlayerConnectionDBMockedComponent>
  let peerState: IPeerStateComponent
  let assignmentMirror: ReturnType<typeof createAssignmentMirrorMockedComponent>
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
    // Zeroed by default so takeover retries do not sleep; a test that cares overrides it explicitly.
    numbers = { CLUSTER_TAKEOVER_RETRY_DELAY_MS: 0, ...numbers }
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
    assignmentMirror = createAssignmentMirrorMockedComponent()
    const logs = createLoggerMockedComponent({})

    const built = await createClusterSubscriberComponent({
      config,
      logs,
      metrics,
      nats,
      livekit,
      accessGate,
      playerConnectionDb,
      peerState,
      assignmentMirror
    })
    // The component fetches its logger once, synchronously, before its first await, so
    // this is already populated by the time createClusterSubscriberComponent resolves.
    logger = logs.getLogger.mock.results[0].value

    return built
  }

  function handlersFor(subjectFragment: string): NatsMessageHandler[] {
    const handlers = nats.subscribe.mock.calls
      .filter(([subject]) => String(subject).includes(subjectFragment))
      .map(([, handler]) => handler as NatsMessageHandler)
    if (handlers.length === 0) {
      throw new Error(`no subscription matching ${subjectFragment}`)
    }
    return handlers
  }

  function handlerFor(subjectFragment: string): NatsMessageHandler {
    return handlersFor(subjectFragment)[0]
  }

  /**
   * Delivers an event to every cluster_change subscription, as a broker would to a lone
   * replica: the grouped one that mints and the un-grouped one that refreshes the mirror.
   */
  async function deliver(subject: string, payload: Uint8Array): Promise<void> {
    for (const handler of handlersFor('cluster_change')) {
      handler(subject, payload)
    }
    await flushMacrotask()
  }

  /**
   * Delivers an event only to the un-grouped mirror subscription, standing in for a replica
   * the queue group did not hand the assignment to. Selected by the absence of a queue option
   * rather than by position, so reordering the subscriptions cannot silently retarget this.
   */
  async function deliverToMirrorOnly(subject: string, payload: Uint8Array): Promise<void> {
    const call = nats.subscribe.mock.calls.find(
      ([subject_, , options]) => String(subject_).includes('cluster_change') && !options
    )
    if (!call) {
      throw new Error('no un-grouped cluster_change subscription')
    }
    ;(call[1] as NatsMessageHandler)(subject, payload)
    await flushMacrotask()
  }

  /**
   * Delivers a session-start event carrying the connecting session key, UTF-8 (or '' for a
   * legacy publisher that names none), and lets its chain settle.
   */
  async function deliverConnect(subject: string, session = ''): Promise<void> {
    handlerFor('connect')(subject, Buffer.from(session, 'utf8'))
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

    it('should subscribe to cluster_change a second time, un-grouped, to feed the mirror', () => {
      // Every replica has to see every assignment, or a replica handed a reconnect could only
      // answer for the wallets the queue group happened to give it.
      expect(nats.subscribe).toHaveBeenCalledWith('peer.*.cluster_change', expect.any(Function))
    })

    it('should subscribe to peer connects, queue-grouped', () => {
      // The mirror leaves every replica able to answer, so an un-grouped subscription would
      // have all of them announce the same room and each join would evict the one before it.
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

    it('should not subscribe to superseded, since Pulse now names the displaced session on the feed', () => {
      expect(nats.subscribe.mock.calls.map(([subject]) => subject)).not.toContain('peer.*.superseded')
    })

    describe('and a cluster_change names a displaced session', () => {
      beforeEach(async () => {
        await deliver(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C5', 'main', '0xbb', { displacedSession: '0xaa', displacedClusterId: 'C3' })
        )
      })

      it('should remove the wallet from the displaced room with a revocation stamp', () => {
        expect(livekit.removeParticipant).toHaveBeenCalledWith('island-C3', WALLET, expect.any(Date))
      })

      it('should remove before it mints, so the new token is not older than the stamp', () => {
        const [removeOrder] = livekit.removeParticipant.mock.invocationCallOrder
        const [mintOrder] = livekit.generateCredentials.mock.invocationCallOrder

        expect(removeOrder).toBeLessThan(mintOrder)
      })

      it('should still mint and publish for the new session', () => {
        // No attributes: '0xbb' is too short to be a real session key.
        expect(livekit.generateCredentials).toHaveBeenCalledWith(
          WALLET,
          'island-C5',
          { cast: [] },
          false,
          undefined,
          undefined
        )
        expect(nats.publish).toHaveBeenCalledTimes(1)
      })

      it('should not park it, since "0xaa" is too malformed to address a parking token to', () => {
        expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_parked_total')
      })

      it('should count the eviction', () => {
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_evicted_total')
      })
    })

    describe('and the displaced-session removal fails once', () => {
      beforeEach(async () => {
        livekit.removeParticipant.mockRejectedValueOnce(new Error('livekit hiccup')).mockResolvedValue(undefined)
        await deliver(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C5', 'main', '0xbb', { displacedSession: '0xaa', displacedClusterId: 'C3' })
        )
      })

      it('should retry and count the eviction, not the failure', () => {
        expect(livekit.removeParticipant).toHaveBeenCalledTimes(2)
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_evicted_total')
        expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_failed_total')
      })

      it('should stamp every retry with the same revocation instant, not a fresh "now"', () => {
        const [, , firstStamp] = livekit.removeParticipant.mock.calls[0]
        const [, , secondStamp] = livekit.removeParticipant.mock.calls[1]

        expect(secondStamp).toBe(firstStamp)
      })
    })

    describe('and a cluster_change names a displaced session, stamped with a fixed receipt time', () => {
      const RECEIVED_AT = 1_700_000_000_000

      beforeEach(async () => {
        jest.spyOn(Date, 'now').mockReturnValue(RECEIVED_AT)
        livekit.removeParticipant.mockRejectedValueOnce(new Error('livekit hiccup')).mockResolvedValue(undefined)

        await deliver(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C5', 'main', '0xbb', { displacedSession: '0xaa', displacedClusterId: 'C3' })
        )
      })

      afterEach(() => {
        jest.restoreAllMocks()
      })

      it("should stamp both attempts with this event's receipt second, not a later retry time", () => {
        expect(livekit.removeParticipant).toHaveBeenCalledTimes(2)
        expect(livekit.removeParticipant).toHaveBeenNthCalledWith(1, 'island-C3', WALLET, new Date(RECEIVED_AT))
        expect(livekit.removeParticipant).toHaveBeenNthCalledWith(2, 'island-C3', WALLET, new Date(RECEIVED_AT))
      })
    })

    describe('and the displaced-session removal keeps failing', () => {
      beforeEach(async () => {
        livekit.removeParticipant.mockRejectedValue(new Error('livekit unreachable'))
        await deliver(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C5', 'main', '0xbb', { displacedSession: '0xaa', displacedClusterId: 'C3' })
        )
      })

      it('should give up after three attempts and count the failure', () => {
        expect(livekit.removeParticipant).toHaveBeenCalledTimes(3)
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_failed_total')
      })

      it('should still mint for the new session, since a stuck eviction must not strand it', () => {
        expect(nats.publish).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the displaced session had already left its room', () => {
      beforeEach(async () => {
        const notFound = Object.assign(new Error('participant not found'), { code: 'not_found' })
        livekit.removeParticipant.mockRejectedValue(notFound)
        await deliver(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C5', 'main', '0xbb', { displacedSession: '0xaa', displacedClusterId: 'C3' })
        )
      })

      it('should remove it once, without retrying', () => {
        expect(livekit.removeParticipant).toHaveBeenCalledTimes(1)
      })

      it('should count it as absent, not evicted or failed', () => {
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_absent_total')
        expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_failed_total')
        expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_evicted_total')
      })

      it('should still mint and publish once for the new session', () => {
        expect(nats.publish).toHaveBeenCalledTimes(1)
      })
    })

    describe('and a cluster_change names a valid displaced session distinct from the new one (F4)', () => {
      const SESSION = '0xbb00000000000000000000000000000000000000'
      const DISPLACED_SESSION = '0xaa00000000000000000000000000000000000000'

      beforeEach(async () => {
        await deliver(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C5', 'main', SESSION, { displacedSession: DISPLACED_SESSION, displacedClusterId: 'C3' })
        )
      })

      it('should mint a token for the displaced session into a private parked room', () => {
        expect(livekit.generateCredentials).toHaveBeenNthCalledWith(
          1,
          WALLET,
          'island-parked-aa00000000000000',
          { cast: [] },
          false,
          undefined,
          { [ISLAND_SESSION_ATTRIBUTE]: DISPLACED_SESSION }
        )
      })

      it('should publish the parking message on the displaced session-addressed subject, carrying the parked room and the previous room as fromIslandId', () => {
        expect(nats.publish.mock.calls[0][0]).toBe(`engine.peer.${WALLET}.island_changed.${DISPLACED_SESSION}`)

        const decoded = IslandChangedMessage.decode(nats.publish.mock.calls[0][1] as Uint8Array)
        expect(decoded.islandId).toBe('island-parked-aa00000000000000')
        expect(decoded.fromIslandId).toBe('island-C3')
      })

      it('should use a 16-hex room suffix, not the 8-hex prefix that could collide across wallets (M3, z)', () => {
        const [, roomArg] = livekit.generateCredentials.mock.calls[0]
        expect(roomArg).toBe('island-parked-aa00000000000000')
        expect((roomArg as string).replace('island-parked-', '')).toHaveLength(16)
      })

      it('should publish the parking message before evicting and before minting the live session', () => {
        const [parkPublishOrder] = nats.publish.mock.invocationCallOrder
        const [removeOrder] = livekit.removeParticipant.mock.invocationCallOrder
        const [, liveMintOrder] = livekit.generateCredentials.mock.invocationCallOrder

        expect(parkPublishOrder).toBeLessThan(removeOrder)
        expect(parkPublishOrder).toBeLessThan(liveMintOrder)
      })

      it('should count the parking', () => {
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_parked_total')
      })

      it('should still evict the displaced session and mint and publish for the live one afterwards', () => {
        expect(livekit.removeParticipant).toHaveBeenCalledWith('island-C3', WALLET, expect.any(Date))
        expect(nats.publish).toHaveBeenCalledTimes(2)
        expect(nats.publish.mock.calls[1][0]).toBe(`engine.peer.${WALLET}.island_changed.${SESSION}`)
      })
    })

    describe('and a cluster_change names a displaced session equal to the new session', () => {
      const SESSION = '0xbb00000000000000000000000000000000000000'

      beforeEach(async () => {
        await deliver(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C5', 'main', SESSION, { displacedSession: SESSION, displacedClusterId: 'C3' })
        )
      })

      it('should not park it, since there is no other device to protect from', () => {
        expect(livekit.generateCredentials).toHaveBeenCalledTimes(1)
        expect(nats.publish).toHaveBeenCalledTimes(1)
        expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_parked_total')
      })

      it('should still evict, since eviction is unconditional on a displaced session being named', () => {
        expect(livekit.removeParticipant).toHaveBeenCalledWith('island-C3', WALLET, expect.any(Date))
      })
    })

    describe('and parking a valid displaced session fails to publish', () => {
      const SESSION = '0xbb00000000000000000000000000000000000000'
      const DISPLACED_SESSION = '0xaa00000000000000000000000000000000000000'

      beforeEach(async () => {
        // First publish is the parking attempt; the rest (the live mint) still succeed.
        nats.publish.mockReturnValueOnce(false).mockReturnValue(true)
        await deliver(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C5', 'main', SESSION, { displacedSession: DISPLACED_SESSION, displacedClusterId: 'C3' })
        )
      })

      it('should count the publish failure, not the parking', () => {
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_publish_failed_total')
        expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_parked_total')
      })

      it('should still evict the displaced session and mint and publish for the live one', () => {
        expect(livekit.removeParticipant).toHaveBeenCalledWith('island-C3', WALLET, expect.any(Date))
        expect(nats.publish).toHaveBeenCalledTimes(2)
        const decoded = IslandChangedMessage.decode(nats.publish.mock.calls[1][1] as Uint8Array)
        expect(decoded.islandId).toBe('island-C5')
      })
    })

    describe('and the wallet accumulates more displaced sessions than the mirror keeps (F4)', () => {
      const SESSION = '0xbb00000000000000000000000000000000000000'
      const displacedSessionAt = (i: number): string => `0x${i.toString(16).padStart(40, '0')}`

      beforeEach(async () => {
        // Same session throughout, so only the explicitly named displaced session is appended
        // each time - isolates the cap/eviction behaviour from the "previous live session joins
        // the list" rule exercised elsewhere.
        for (let i = 1; i <= 9; i++) {
          await deliver(
            `peer.${WALLET}.cluster_change`,
            clusterChange('C5', 'main', SESSION, { displacedSession: displacedSessionAt(i), displacedClusterId: 'C3' })
          )
        }
      })

      it('should keep only the 8 most recently displaced sessions, dropping the oldest', () => {
        const entry = assignmentMirror.get(WALLET)

        expect(entry?.displaced).toEqual([2, 3, 4, 5, 6, 7, 8, 9].map(displacedSessionAt))
      })
    })

    describe('and a session that was displaced becomes the live one again (B2, t)', () => {
      const SESSION_1 = '0xaa00000000000000000000000000000000000000'
      const SESSION_2 = '0xbb00000000000000000000000000000000000000'

      beforeEach(async () => {
        // S1 live, then a takeover to S2 names S1 as displaced - the mirror remembers it.
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5', 'main', SESSION_1))
        await deliver(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C6', 'main', SESSION_2, { displacedSession: SESSION_1, displacedClusterId: 'C5' })
        )

        // Pulse names S1 live again (the device signing back in) - S2 becomes displaced in turn.
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5', 'main', SESSION_1))
      })

      it('should remove the newly-live session from the displaced list it was previously remembered in', () => {
        const entry = assignmentMirror.get(WALLET)

        expect(entry?.session).toBe(SESSION_1)
        expect(entry?.displaced).not.toContain(SESSION_1)
      })

      it('should still remember the session it just displaced', () => {
        const entry = assignmentMirror.get(WALLET)

        expect(entry?.displaced).toContain(SESSION_2)
      })
    })

    describe('and the displaced cluster is the current cluster (N1)', () => {
      const SESSION = '0xbb00000000000000000000000000000000000000'
      const OTHER_SESSION = '0xaa00000000000000000000000000000000000000'

      describe('and a retry observes that another replica has admitted the new session', () => {
        beforeEach(async () => {
          livekit.listParticipantsHolding
            .mockResolvedValueOnce([{ identity: WALLET, session: OTHER_SESSION }])
            .mockResolvedValue([{ identity: WALLET, session: SESSION }])
          livekit.removeParticipant.mockRejectedValueOnce(new Error('temporary failure'))
          await deliver(
            `peer.${WALLET}.cluster_change`,
            clusterChange('C5', 'main', SESSION, { displacedSession: OTHER_SESSION, displacedClusterId: 'C5' })
          )
        })
        it('should not retry removal against the newly admitted participant', () => {
          expect(livekit.removeParticipant).toHaveBeenCalledTimes(1)
        })
      })

      describe('and every holder under the identity already carries the new session', () => {
        beforeEach(async () => {
          livekit.listParticipantsHolding.mockResolvedValue([{ identity: WALLET, session: SESSION }])

          await deliver(
            `peer.${WALLET}.cluster_change`,
            clusterChange('C5', 'main', SESSION, { displacedSession: OTHER_SESSION, displacedClusterId: 'C5' })
          )
        })

        it('should ask LiveKit who holds the wallet in that room before removing anyone', () => {
          expect(livekit.listParticipantsHolding).toHaveBeenCalledWith('island-C5', WALLET)
        })

        it('should skip the removal, since the connect path already healed this wallet in', () => {
          expect(livekit.removeParticipant).not.toHaveBeenCalled()
        })

        it('should count the skip', () => {
          expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_skipped_live_total')
          expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_evicted_total')
        })

        it('should still mint and publish for the live session, alongside the parking publish for OTHER_SESSION', () => {
          // OTHER_SESSION is itself a valid, different session, so F4 also parks it - this
          // assertion is about N1 leaving the live mint/publish untouched, not about F4.
          expect(nats.publish).toHaveBeenCalledTimes(2)
          expect(nats.publish.mock.calls[1][0]).toBe(`engine.peer.${WALLET}.island_changed.${SESSION}`)
        })
      })

      describe('and a holder still carries the displaced session', () => {
        beforeEach(async () => {
          livekit.listParticipantsHolding.mockResolvedValue([{ identity: MIXED_CASE_WALLET, session: OTHER_SESSION }])

          await deliver(
            `peer.${WALLET}.cluster_change`,
            clusterChange('C5', 'main', SESSION, { displacedSession: OTHER_SESSION, displacedClusterId: 'C5' })
          )
        })

        it('should remove the exact identity LiveKit listed, not the wallet', () => {
          expect(livekit.removeParticipant).toHaveBeenCalledWith('island-C5', MIXED_CASE_WALLET, expect.any(Date))
        })

        it('should count the eviction', () => {
          expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_evicted_total')
          expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_skipped_live_total')
        })

        it('should still mint and publish for the live session, alongside the parking publish for OTHER_SESSION', () => {
          // OTHER_SESSION is itself a valid, different session, so F4 also parks it - this
          // assertion is about N1 leaving the live mint/publish untouched, not about F4.
          expect(nats.publish).toHaveBeenCalledTimes(2)
          expect(nats.publish.mock.calls[1][0]).toBe(`engine.peer.${WALLET}.island_changed.${SESSION}`)
        })
      })

      describe('and holders are mixed: one already carries the new session, another does not (I4, y)', () => {
        beforeEach(async () => {
          livekit.listParticipantsHolding.mockResolvedValue([
            { identity: MIXED_CASE_WALLET, session: OTHER_SESSION },
            { identity: WALLET, session: SESSION }
          ])

          await deliver(
            `peer.${WALLET}.cluster_change`,
            clusterChange('C5', 'main', SESSION, { displacedSession: OTHER_SESSION, displacedClusterId: 'C5' })
          )
        })

        it('should remove only the stale identity, never the one already carrying the new session', () => {
          expect(livekit.removeParticipant).toHaveBeenCalledWith('island-C5', MIXED_CASE_WALLET, expect.any(Date))
          expect(livekit.removeParticipant).not.toHaveBeenCalledWith('island-C5', WALLET, expect.any(Date))
          expect(livekit.removeParticipant).toHaveBeenCalledTimes(1)
        })

        it('should count the eviction, not the skip', () => {
          expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_evicted_total')
          expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_skipped_live_total')
        })

        it('should still mint and publish for the live session, alongside the parking publish for OTHER_SESSION', () => {
          // OTHER_SESSION is itself a valid, different session, so F4 also parks it - this
          // assertion is about I4 leaving the live mint/publish untouched, not about F4.
          expect(nats.publish).toHaveBeenCalledTimes(2)
          expect(nats.publish.mock.calls[1][0]).toBe(`engine.peer.${WALLET}.island_changed.${SESSION}`)
        })
      })

      describe('and the listing fails', () => {
        beforeEach(async () => {
          livekit.listParticipantsHolding.mockRejectedValue(new Error('livekit unreachable'))
          livekit.removeParticipant.mockResolvedValue(undefined)

          await deliver(
            `peer.${WALLET}.cluster_change`,
            clusterChange('C5', 'main', SESSION, { displacedSession: OTHER_SESSION, displacedClusterId: 'C5' })
          )
        })

        it('should fall through and attempt the removal by wallet, fail closed towards eviction', () => {
          expect(livekit.removeParticipant).toHaveBeenCalledWith('island-C5', WALLET, expect.any(Date))
        })

        it('should count the eviction, not the skip', () => {
          expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_evicted_total')
          expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_skipped_live_total')
        })
      })
    })

    describe('and a cluster_change names a displaced session with no displaced cluster', () => {
      beforeEach(async () => {
        await deliver(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C5', 'main', '0xbb', { displacedSession: '0xaa', displacedClusterId: '' })
        )
      })

      it('should remove nobody, since no room is named to remove it from', () => {
        expect(livekit.removeParticipant).not.toHaveBeenCalled()
      })

      it('should count the failure', () => {
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_failed_total')
      })

      it('should still mint and publish once for the new session', () => {
        expect(livekit.generateCredentials).toHaveBeenCalledTimes(1)
        expect(nats.publish).toHaveBeenCalledTimes(1)
      })
    })

    describe('and a cluster_change names no displaced session', () => {
      beforeEach(async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5', 'main', '0xbb'))
      })

      it('should remove nobody', () => {
        expect(livekit.removeParticipant).not.toHaveBeenCalled()
      })

      it('should not park anyone, since there is no displaced session to park', () => {
        expect(nats.publish).toHaveBeenCalledTimes(1)
        expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_takeover_parked_total')
      })
    })

    describe('and the event names a session', () => {
      it('should publish on the session-addressed subject', async () => {
        await deliver(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C5', 'main', '0xbb00000000000000000000000000000000000000')
        )

        expect(nats.publish.mock.calls[0][0]).toBe(
          `engine.peer.${WALLET}.island_changed.0xbb00000000000000000000000000000000000000`
        )
      })

      it('should never publish the same event on both subjects', async () => {
        await deliver(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C5', 'main', '0xbb00000000000000000000000000000000000000')
        )

        expect(nats.publish).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the event names a malformed session', () => {
      it('should fall back to the legacy subject', async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5', 'main', 'not-a-key'))

        expect(nats.publish.mock.calls[0][0]).toBe(`engine.peer.${WALLET}.island_changed`)
      })
    })

    describe('and an older Pulse sends no session', () => {
      it('should fall back to the legacy subject', async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5'))

        expect(nats.publish.mock.calls[0][0]).toBe(`engine.peer.${WALLET}.island_changed`)
      })
    })

    describe('and the mint stamps the session onto the LiveKit token', () => {
      it('should set attributes[dclsession] to the lower-cased session when it is a valid key', async () => {
        await deliver(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C5', 'main', '0xbb00000000000000000000000000000000000000')
        )

        expect(livekit.generateCredentials).toHaveBeenCalledWith(WALLET, 'island-C5', { cast: [] }, false, undefined, {
          [ISLAND_SESSION_ATTRIBUTE]: '0xbb00000000000000000000000000000000000000'
        })
      })

      it('should set no attributes when the session is not a valid key', async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5', 'main', 'not-a-key'))

        expect(livekit.generateCredentials).toHaveBeenCalledWith(
          WALLET,
          'island-C5',
          { cast: [] },
          false,
          undefined,
          undefined
        )
      })

      it('should set no attributes when an older Pulse sends no session', async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5'))

        expect(livekit.generateCredentials).toHaveBeenCalledWith(
          WALLET,
          'island-C5',
          { cast: [] },
          false,
          undefined,
          undefined
        )
      })
    })

    describe('and a peer connect names a session other than the one Pulse last published', () => {
      beforeEach(async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5', 'main', '0xbb'))
        nats.publish.mockClear()
        await deliverConnect(`peer.${WALLET}.connect`, '0xaa00000000000000000000000000000000000000')
      })

      it('should not re-announce, since that device was displaced', () => {
        expect(nats.publish).not.toHaveBeenCalled()
        expect(livekit.listParticipantsHolding).not.toHaveBeenCalled()
      })

      it('should count the skip', () => {
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_skipped_other_session_total')
      })
    })

    describe('and a peer connect names a session the mirror remembers as previously displaced (F4/B2)', () => {
      const SESSION_A = '0xaa00000000000000000000000000000000000000'
      const SESSION_B = '0xbb00000000000000000000000000000000000000'

      beforeEach(async () => {
        // Mirror-only (not the grouped mint path), so the ban gate has not already cached this
        // wallet as allowed - the banned sub-case below needs a cold ban cache to override.
        await deliverToMirrorOnly(`peer.${WALLET}.cluster_change`, clusterChange('C5', 'main', SESSION_A))
        // A takeover to SESSION_B names SESSION_A as displaced, so the mirror remembers it.
        await deliverToMirrorOnly(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C6', 'main', SESSION_B, { displacedSession: SESSION_A, displacedClusterId: 'C5' })
        )
        nats.publish.mockClear()
        livekit.generateCredentials.mockClear()
        livekit.removeParticipant.mockClear()
        livekit.listParticipantsHolding.mockClear()
        metrics.increment.mockClear()
      })

      describe('and the live session still holds the room (u)', () => {
        beforeEach(async () => {
          livekit.listParticipantsHolding.mockResolvedValue([{ identity: WALLET, session: SESSION_B }])

          await deliverConnect(`peer.${WALLET}.connect`, SESSION_A)
        })

        it('should ask LiveKit for positive evidence before parking', () => {
          expect(livekit.listParticipantsHolding).toHaveBeenCalledWith('island-C6', WALLET)
        })

        it('should park it rather than ignore it, since its ws socket may simply have dropped and re-handshook', () => {
          expect(nats.publish).toHaveBeenCalledTimes(1)
          expect(nats.publish.mock.calls[0][0]).toBe(`engine.peer.${WALLET}.island_changed.${SESSION_A}`)

          const decoded = IslandChangedMessage.decode(nats.publish.mock.calls[0][1] as Uint8Array)
          expect(decoded.islandId).toBe('island-parked-aa00000000000000')
        })

        it('should count the parked reconnect, nothing else', () => {
          expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_parked_total')
          expect(metrics.increment).not.toHaveBeenCalledWith(
            'dcl_gatekeeper_cluster_reannounce_skipped_other_session_total'
          )
          expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_banned_skipped_total')
        })

        it('should not evict anyone, since parking answers the connect on its own', () => {
          expect(livekit.removeParticipant).not.toHaveBeenCalled()
        })
      })

      describe('and the mirror is refreshed to name the connecting session live while the evidence lookup is still in flight (I1)', () => {
        let holding: ReturnType<typeof createDeferred<{ identity: string; session: string | null }[]>>

        beforeEach(async () => {
          holding = createDeferred()
          livekit.listParticipantsHolding.mockImplementationOnce(() => holding.promise)

          // The connect starts its evidence lookup, which stalls (proven by the assertions below
          // running against a settled `deliverConnect` that has not yet published anything).
          await deliverConnect(`peer.${WALLET}.connect`, SESSION_A)

          // Pulse's own cluster_change lands on this replica while the lookup is still pending,
          // naming SESSION_A live again - the device is signing back in for real, not a leftover.
          await deliverToMirrorOnly(
            `peer.${WALLET}.cluster_change`,
            clusterChange('C7', 'main', SESSION_A, { displacedSession: SESSION_B, displacedClusterId: 'C6' })
          )

          // Resolved with the same positive evidence (u) parks on, to prove it is the mirror
          // re-read - not a lack of evidence - that stops the park.
          holding.resolve([{ identity: WALLET, session: SESSION_B }])
          await flushMacrotask()
        })

        it('should not park it, nor publish anything', () => {
          expect(nats.publish).not.toHaveBeenCalled()
        })

        it('should count it like any other unrecognised session', () => {
          expect(metrics.increment).toHaveBeenCalledWith(
            'dcl_gatekeeper_cluster_reannounce_skipped_other_session_total'
          )
          expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_parked_total')
        })

        it('should not evict anyone', () => {
          expect(livekit.removeParticipant).not.toHaveBeenCalled()
        })
      })

      describe('and the connecting session becomes live while the parking credentials are being minted', () => {
        let credentials: ReturnType<typeof createDeferred<{ url: string; token: string }>>
        beforeEach(async () => {
          credentials = createDeferred()
          livekit.listParticipantsHolding.mockResolvedValue([{ identity: WALLET, session: SESSION_B }])
          livekit.generateCredentials.mockImplementationOnce(() => credentials.promise)
          await deliverConnect(`peer.${WALLET}.connect`, SESSION_A)
          await deliverToMirrorOnly(
            `peer.${WALLET}.cluster_change`,
            clusterChange('C7', 'main', SESSION_A, { displacedSession: SESSION_B, displacedClusterId: 'C6' })
          )
          credentials.resolve({ url: 'wss://livekit.example', token: 'stale-parking-token' })
          await flushMacrotask()
        })
        it('should discard the stale parking assignment before publishing it', () => {
          expect(nats.publish).not.toHaveBeenCalled()
        })
      })

      describe('and the live session no longer holds the room - an empty room (v)', () => {
        beforeEach(async () => {
          // The live device already left, so this connecting session may genuinely be signing
          // back in - B2's whole point is that this must never be parked on the remembered-
          // displaced fact alone.
          livekit.listParticipantsHolding.mockResolvedValue([])

          await deliverConnect(`peer.${WALLET}.connect`, SESSION_A)
        })

        it('should not park it, nor publish anything', () => {
          expect(nats.publish).not.toHaveBeenCalled()
        })

        it('should count it like any other unrecognised session', () => {
          expect(metrics.increment).toHaveBeenCalledWith(
            'dcl_gatekeeper_cluster_reannounce_skipped_other_session_total'
          )
          expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_parked_total')
        })

        it('should not evict anyone', () => {
          expect(livekit.removeParticipant).not.toHaveBeenCalled()
        })
      })

      describe('and only a holder with no session attribute is in the room (v)', () => {
        beforeEach(async () => {
          livekit.listParticipantsHolding.mockResolvedValue([{ identity: WALLET, session: null }])

          await deliverConnect(`peer.${WALLET}.connect`, SESSION_A)
        })

        it('should not park it, since nobody positively carries the live session', () => {
          expect(nats.publish).not.toHaveBeenCalled()
          expect(metrics.increment).toHaveBeenCalledWith(
            'dcl_gatekeeper_cluster_reannounce_skipped_other_session_total'
          )
        })
      })

      describe('and only a holder with a different session is in the room (v)', () => {
        beforeEach(async () => {
          const someOtherSession = '0xcc00000000000000000000000000000000000000'
          livekit.listParticipantsHolding.mockResolvedValue([{ identity: WALLET, session: someOtherSession }])

          await deliverConnect(`peer.${WALLET}.connect`, SESSION_A)
        })

        it('should not park it, since the holder does not carry the live session recorded in the mirror', () => {
          expect(nats.publish).not.toHaveBeenCalled()
          expect(metrics.increment).toHaveBeenCalledWith(
            'dcl_gatekeeper_cluster_reannounce_skipped_other_session_total'
          )
        })
      })

      describe('and the LiveKit lookup fails (w)', () => {
        beforeEach(async () => {
          livekit.listParticipantsHolding.mockRejectedValue(new Error('livekit unreachable'))

          await deliverConnect(`peer.${WALLET}.connect`, SESSION_A)
        })

        it('should not park it, falling back to the unrecognised-session path', () => {
          expect(nats.publish).not.toHaveBeenCalled()
          expect(metrics.increment).toHaveBeenCalledWith(
            'dcl_gatekeeper_cluster_reannounce_skipped_other_session_total'
          )
          expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_parked_total')
        })
      })

      describe('and the wallet is banned (x)', () => {
        beforeEach(async () => {
          accessGate.getAccessState.mockResolvedValue({ isBanned: true, isDenylisted: false })
          // Would be positive evidence if the lookup were ever reached - proves the ban gate
          // runs first and short-circuits before it.
          livekit.listParticipantsHolding.mockResolvedValue([{ identity: WALLET, session: SESSION_B }])

          await deliverConnect(`peer.${WALLET}.connect`, SESSION_A)
        })

        it('should not park it, nor look anyone up', () => {
          expect(nats.publish).not.toHaveBeenCalled()
          expect(livekit.listParticipantsHolding).not.toHaveBeenCalled()
        })

        it('should count the ban skip only', () => {
          expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_banned_skipped_total')
          expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_parked_total')
          expect(metrics.increment).not.toHaveBeenCalledWith(
            'dcl_gatekeeper_cluster_reannounce_skipped_other_session_total'
          )
        })
      })
    })

    describe('and a peer connect names the session Pulse last published', () => {
      beforeEach(async () => {
        await deliver(
          `peer.${WALLET}.cluster_change`,
          clusterChange('C5', 'main', '0xbb00000000000000000000000000000000000000')
        )
        nats.publish.mockClear()
        await deliverConnect(`peer.${WALLET}.connect`, '0xbb00000000000000000000000000000000000000')
      })

      it('should re-announce', () => {
        expect(nats.publish).toHaveBeenCalledTimes(1)
      })

      it('should re-announce on the session-addressed subject', () => {
        expect(nats.publish.mock.calls[0][0]).toBe(
          `engine.peer.${WALLET}.island_changed.0xbb00000000000000000000000000000000000000`
        )
      })
    })

    describe('and a peer connect carries a legacy socket id instead of a session', () => {
      beforeEach(async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5', 'main', '0xbb'))
        nats.publish.mockClear()
        await deliverConnect(`peer.${WALLET}.connect`, '018f3c2a1b9c0d1e2f3a4b5c6d7e8f9011223344')
      })

      it('should re-announce as before, since an older publisher cannot be told apart from a match', () => {
        expect(nats.publish).toHaveBeenCalledTimes(1)
      })
    })

    describe('and a peer connect carries a legacy socket id and someone already holds the room', () => {
      beforeEach(async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5', 'main', '0xbb'))
        nats.publish.mockClear()
        livekit.listParticipantsHolding.mockResolvedValue([{ identity: WALLET, session: null }])

        await deliverConnect(`peer.${WALLET}.connect`, '018f3c2a1b9c0d1e2f3a4b5c6d7e8f9011223344')
      })

      it('should suppress by identity alone, since neither side names a session to compare', () => {
        expect(nats.publish).not.toHaveBeenCalled()
        expect(livekit.removeParticipant).not.toHaveBeenCalled()
      })

      it('should count the suppression', () => {
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_suppressed_total')
      })
    })

    describe('and an older Pulse assignment named no session, and someone already holds the room', () => {
      const SESSION = '0xbb00000000000000000000000000000000000000'

      beforeEach(async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5'))
        nats.publish.mockClear()
        livekit.listParticipantsHolding.mockResolvedValue([{ identity: WALLET, session: null }])

        await deliverConnect(`peer.${WALLET}.connect`, SESSION)
      })

      it('should suppress by identity alone, since the mirror names no session to compare', () => {
        expect(nats.publish).not.toHaveBeenCalled()
        expect(livekit.removeParticipant).not.toHaveBeenCalled()
      })

      it('should count the suppression', () => {
        expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_suppressed_total')
      })
    })

    describe('and a cluster_change arrives', () => {
      let decoded: IslandChangedMessage

      beforeEach(async () => {
        await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5'))
        decoded = IslandChangedMessage.decode(nats.publish.mock.calls[0][1] as Uint8Array)
      })

      it('should mint a token for the island room', () => {
        expect(livekit.generateCredentials).toHaveBeenCalledWith(
          WALLET,
          'island-C5',
          { cast: [] },
          false,
          undefined,
          undefined
        )
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
        expect(livekit.generateCredentials).toHaveBeenCalledWith(
          LOWER_CASE_WALLET,
          'island-C5',
          { cast: [] },
          false,
          undefined,
          undefined
        )
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

    describe('and a peer connect arrives', () => {
      describe('and it names any wallet', () => {
        beforeEach(async () => {
          await deliverConnect(`peer.${WALLET}.connect`)
        })

        it('should count the connect event', () => {
          expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_connects_received_total')
        })
      })

      describe('and Pulse has assigned the wallet', () => {
        const SESSION = '0xbb00000000000000000000000000000000000000'
        const OTHER_SESSION = '0xaa00000000000000000000000000000000000000'

        beforeEach(async () => {
          await deliver(`peer.${WALLET}.cluster_change`, clusterChange('C5', 'main', SESSION))
          nats.publish.mockClear()
          livekit.generateCredentials.mockClear()
        })

        describe('and nobody holds the identity in that room', () => {
          let reannounced: IslandChangedMessage

          beforeEach(async () => {
            livekit.listParticipantsHolding.mockResolvedValue([])

            await deliverConnect(`peer.${WALLET}.connect`, SESSION)
            reannounced = IslandChangedMessage.decode(nats.publish.mock.calls[0][1] as Uint8Array)
          })

          it('should have asked LiveKit who holds the wallet in its last known room', () => {
            expect(livekit.listParticipantsHolding).toHaveBeenCalledWith('island-C5', WALLET)
          })

          it('should publish on the session-addressed subject', () => {
            expect(nats.publish.mock.calls[0][0]).toBe(`engine.peer.${WALLET}.island_changed.${SESSION}`)
          })

          it('should carry the last known room as islandId', () => {
            expect(reannounced.islandId).toBe('island-C5')
          })

          it('should mint a fresh token rather than replay the one already sent', () => {
            // The string the peer was last given embeds a JWT that may well have expired
            // during the outage that caused the reconnect.
            expect(livekit.generateCredentials).toHaveBeenCalledTimes(1)
          })

          it('should mint with the dclsession attribute, so the next connect can tell this device apart', () => {
            expect(livekit.generateCredentials).toHaveBeenCalledWith(
              WALLET,
              'island-C5',
              { cast: [] },
              false,
              undefined,
              {
                [ISLAND_SESSION_ATTRIBUTE]: SESSION
              }
            )
          })

          it('should not evict anyone', () => {
            expect(livekit.removeParticipant).not.toHaveBeenCalled()
          })

          it('should count the attempt', () => {
            expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_attempted_total')
          })
        })

        describe('and the participant holding it carries the connecting session', () => {
          beforeEach(async () => {
            livekit.listParticipantsHolding.mockResolvedValue([{ identity: WALLET, session: SESSION }])

            await deliverConnect(`peer.${WALLET}.connect`, SESSION)
          })

          it('should publish nothing further, since re-joining would evict the live session', () => {
            expect(nats.publish).not.toHaveBeenCalled()
          })

          it('should not evict anyone', () => {
            expect(livekit.removeParticipant).not.toHaveBeenCalled()
          })

          it('should count the suppression', () => {
            expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_suppressed_total')
          })
        })

        describe('and the participant holding it carries a different session', () => {
          beforeEach(async () => {
            livekit.listParticipantsHolding.mockResolvedValue([{ identity: WALLET, session: OTHER_SESSION }])
            livekit.removeParticipant.mockResolvedValue(undefined)

            await deliverConnect(`peer.${WALLET}.connect`, SESSION)
          })

          it('should remove it identity-wide with a revocation stamp', () => {
            expect(livekit.removeParticipant).toHaveBeenCalledWith('island-C5', WALLET, expect.any(Date))
          })

          it('should remove before it mints, so the new token is not older than the stamp', () => {
            const [removeOrder] = livekit.removeParticipant.mock.invocationCallOrder
            const [mintOrder] = livekit.generateCredentials.mock.invocationCallOrder

            expect(removeOrder).toBeLessThan(mintOrder)
          })

          it('should still mint and publish to the session-addressed subject', () => {
            expect(nats.publish.mock.calls[0][0]).toBe(`engine.peer.${WALLET}.island_changed.${SESSION}`)
          })

          it('should count the stale eviction, not the plain attempt', () => {
            expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_evicted_stale_total')
            expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_attempted_total')
          })
        })

        describe('and another session takes over while the holder lookup is in flight', () => {
          let holding: ReturnType<typeof createDeferred<{ identity: string; session: string | null }[]>>
          beforeEach(async () => {
            holding = createDeferred()
            livekit.listParticipantsHolding.mockImplementationOnce(() => holding.promise)
            await deliverConnect(`peer.${WALLET}.connect`, SESSION)
            await deliverToMirrorOnly(
              `peer.${WALLET}.cluster_change`,
              clusterChange('C5', 'main', OTHER_SESSION, { displacedSession: SESSION, displacedClusterId: 'C5' })
            )
            holding.resolve([{ identity: WALLET, session: OTHER_SESSION }])
            await flushMacrotask()
          })
          it('should leave the newly active participant in the room', () => {
            expect(livekit.removeParticipant).not.toHaveBeenCalled()
          })
          it('should not reannounce the displaced session', () => {
            expect(nats.publish).not.toHaveBeenCalled()
          })
        })
        describe('and the participant holding it carries a malformed session attribute', () => {
          beforeEach(async () => {
            livekit.listParticipantsHolding.mockResolvedValue([{ identity: WALLET, session: 'unknown' }])
            await deliverConnect(`peer.${WALLET}.connect`, SESSION)
          })
          it('should suppress the unclassifiable holder without evicting it', () => {
            expect(livekit.removeParticipant).not.toHaveBeenCalled()
          })
          it('should not publish another assignment', () => {
            expect(nats.publish).not.toHaveBeenCalled()
          })
        })

        describe('and the participant holding it carries no session attribute', () => {
          beforeEach(async () => {
            livekit.listParticipantsHolding.mockResolvedValue([{ identity: WALLET, session: null }])

            await deliverConnect(`peer.${WALLET}.connect`, SESSION)
          })

          it('should not evict it, since a missing attribute cannot be told apart from the connecting device', () => {
            expect(livekit.removeParticipant).not.toHaveBeenCalled()
          })

          it('should publish nothing further', () => {
            expect(nats.publish).not.toHaveBeenCalled()
          })

          it('should count the suppression, not a stale eviction', () => {
            expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_suppressed_total')
            expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_evicted_stale_total')
          })
        })

        describe('and the stale participant was listed under a differently-cased identity', () => {
          beforeEach(async () => {
            livekit.listParticipantsHolding.mockResolvedValue([{ identity: MIXED_CASE_WALLET, session: OTHER_SESSION }])
            livekit.removeParticipant.mockResolvedValue(undefined)

            await deliverConnect(`peer.${WALLET}.connect`, SESSION)
          })

          it('should remove the exact identity LiveKit listed, not the connecting wallet', () => {
            expect(livekit.removeParticipant).toHaveBeenCalledWith('island-C5', MIXED_CASE_WALLET, expect.any(Date))
          })

          it('should still mint and publish', () => {
            expect(nats.publish).toHaveBeenCalledTimes(1)
          })
        })

        describe('and the stale eviction reports the participant already gone', () => {
          beforeEach(async () => {
            livekit.listParticipantsHolding.mockResolvedValue([{ identity: WALLET, session: OTHER_SESSION }])
            const notFound = Object.assign(new Error('participant not found'), { code: 'not_found' })
            livekit.removeParticipant.mockRejectedValue(notFound)

            await deliverConnect(`peer.${WALLET}.connect`, SESSION)
          })

          it('should still count it as a stale eviction, not a failure', () => {
            expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_evicted_stale_total')
            expect(metrics.increment).not.toHaveBeenCalledWith(
              'dcl_gatekeeper_cluster_reannounce_stale_evict_failed_total'
            )
          })

          it('should proceed with the re-announce', () => {
            expect(nats.publish).toHaveBeenCalledTimes(1)
          })
        })

        describe('and the stale eviction fails for another reason', () => {
          beforeEach(async () => {
            livekit.listParticipantsHolding.mockResolvedValue([{ identity: WALLET, session: OTHER_SESSION }])
            livekit.removeParticipant.mockRejectedValue(new Error('livekit unreachable'))

            await deliverConnect(`peer.${WALLET}.connect`, SESSION)
          })

          it('should count the failure, not the eviction', () => {
            expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_stale_evict_failed_total')
            expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_evicted_stale_total')
          })

          it('should not re-announce, since that would put the new session next to a live displaced one', () => {
            expect(nats.publish).not.toHaveBeenCalled()
          })

          it('should warn about the wallet it could not evict', () => {
            expect(logger.warn).toHaveBeenCalledWith(
              expect.stringContaining(`Cannot evict stale participant of ${WALLET}`)
            )
          })
        })

        describe('and the LiveKit lookup fails', () => {
          // Fails closed, unlike the ban gate: an outage of this lookup coincides with mass
          // reconnects, and reading "cannot tell" as "absent" would re-announce every peer
          // into the room it still holds, ending all of those sessions at once.
          beforeEach(async () => {
            livekit.listParticipantsHolding.mockRejectedValue(new Error('livekit unreachable'))

            await deliverConnect(`peer.${WALLET}.connect`, SESSION)
          })

          it('should publish nothing further, since a failed lookup is not proof of absence', () => {
            expect(nats.publish).not.toHaveBeenCalled()
          })

          it('should count the failed check', () => {
            expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_check_failed_total')
          })

          it('should warn about the wallet it could not resolve', () => {
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Cannot tell whether ${WALLET}`))
          })
        })

        describe('and a move for the same wallet is still minting', () => {
          let stalledMint: ReturnType<typeof createDeferred<{ url: string; token: string }>>

          beforeEach(async () => {
            stalledMint = createDeferred<{ url: string; token: string }>()
            livekit.generateCredentials.mockImplementationOnce(() => stalledMint.promise)
            livekit.listParticipantsHolding.mockResolvedValue([])

            // C6 arrives and stalls minting; the reconnect lands right behind it. Unserialized
            // the connect would mint and publish immediately, racing the move it queued behind.
            for (const handler of handlersFor('cluster_change')) {
              handler(`peer.${WALLET}.cluster_change`, clusterChange('C6', 'main', SESSION))
            }
            handlerFor('connect')(`peer.${WALLET}.connect`, Buffer.from(SESSION, 'utf8'))
            await flushMacrotask()
          })

          it('should hold the reconnect behind the stalled move', () => {
            expect(nats.publish).not.toHaveBeenCalled()
          })

          it('should re-announce the newer room once the move completes', async () => {
            stalledMint.resolve({ url: 'wss://livekit.example', token: 'newer-jwt' })
            await flushMacrotask()

            expect(IslandChangedMessage.decode(nats.publish.mock.calls[1][1] as Uint8Array).islandId).toBe('island-C6')
          })
        })
      })

      describe('and the wallet is platform banned by the time it reconnects', () => {
        beforeEach(async () => {
          accessGate.getAccessState.mockResolvedValue({ isBanned: true, isDenylisted: false })
          livekit.listParticipantsHolding.mockResolvedValue([])
          // Mirror-only, so the ban gate has not already cached this wallet as allowed.
          await deliverToMirrorOnly(`peer.${WALLET}.cluster_change`, clusterChange('C5'))

          await deliverConnect(`peer.${WALLET}.connect`)
        })

        it('should publish nothing, since a reconnect runs the same gate as an assignment', () => {
          expect(nats.publish).not.toHaveBeenCalled()
        })
      })

      describe('and only the mirror saw the assignment, because the queue group gave the mint elsewhere', () => {
        beforeEach(async () => {
          await deliverToMirrorOnly(`peer.${WALLET}.cluster_change`, clusterChange('C5'))
          livekit.listParticipantsHolding.mockResolvedValue([])

          await deliverConnect(`peer.${WALLET}.connect`)
        })

        it('should still re-announce, since the mirror is fed on every replica', () => {
          expect(IslandChangedMessage.decode(nats.publish.mock.calls[0][1] as Uint8Array).islandId).toBe('island-C5')
        })
      })

      describe('and Pulse has not assigned the wallet', () => {
        beforeEach(async () => {
          await deliverConnect(`peer.${WALLET}.connect`)
        })

        it('should publish nothing, since it has no room to name', () => {
          expect(nats.publish).not.toHaveBeenCalled()
        })

        it('should not ask LiveKit about a room it cannot name', () => {
          expect(livekit.listParticipantsHolding).not.toHaveBeenCalled()
        })

        it('should count the unresolved connect', () => {
          expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_reannounce_unresolved_total')
        })
      })

      describe('and the subject carries no wallet token', () => {
        beforeEach(async () => {
          await deliverConnect('connect')
        })

        it('should warn about the subject it could not parse', () => {
          expect(logger.warn).toHaveBeenCalledWith('Cannot extract a wallet from subject connect')
        })

        it('should publish nothing', () => {
          expect(nats.publish).not.toHaveBeenCalled()
        })
      })

      describe('and the wallet arrives upper-cased in the subject', () => {
        beforeEach(async () => {
          await deliver(`peer.${LOWER_CASE_WALLET}.cluster_change`, clusterChange('C5'))
          livekit.listParticipantsHolding.mockResolvedValue([])

          await deliverConnect(`peer.${MIXED_CASE_WALLET}.connect`)
        })

        it('should resolve the same mirror entry the lower-cased feed wrote', () => {
          expect(nats.publish.mock.calls[1][0]).toBe(`engine.peer.${LOWER_CASE_WALLET}.island_changed`)
        })
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
