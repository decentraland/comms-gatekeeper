import { PeerClusterChange, TakeoverCompleted } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { START_COMPONENT, STOP_COMPONENT, IBaseComponent } from '@well-known-components/interfaces'
import * as timer from '../../../src/utils/timer'
import { createClusterSubscriberComponent, IClusterSubscriberComponent } from '../../../src/logic/cluster-subscriber'
import { createNatsMockedComponent } from '../../mocks/nats-mock'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createAccessGateMockedComponent } from '../../mocks/access-gate-mock'
import { createPeerStateMockedComponent } from '../../mocks/peer-state-mock'
import { createConfigMockedComponent } from '../../mocks/config-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createMetricsMockedComponent } from '../../mocks/metrics-mock'
import { createDeferred, createKeyedQueueTestComponent, flushMacrotask } from '../../utils'

const WALLET = '0x1111111111111111111111111111111111111111'
const SESSION = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const NEXT_SESSION = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const OLD_SESSION = '0xcccccccccccccccccccccccccccccccccccccccc'
const START: IBaseComponent.ComponentStartOptions = { started: () => true, live: () => true, getComponents: () => ({}) }

function plan(): PeerClusterChange {
  return PeerClusterChange.fromPartial({ clusterId: 'room-a', realm: 'main', session: SESSION, tokenNotBefore: 0 })
}

describe('when executing Pulse-owned takeover recovery', () => {
  let component: IClusterSubscriberComponent
  let nats: ReturnType<typeof createNatsMockedComponent>
  let livekit: ReturnType<typeof createLivekitMockedComponent>
  let accessGate: ReturnType<typeof createAccessGateMockedComponent>
  let peerState: ReturnType<typeof createPeerStateMockedComponent>
  let metrics: ReturnType<typeof createMetricsMockedComponent>
  let config: ReturnType<typeof createConfigMockedComponent>
  let logs: ReturnType<typeof createLoggerMockedComponent>
  let authority: PeerClusterChange
  let acceptReports: boolean
  let now: number
  let numbers: Record<string, number>

  function handler(kind: string) {
    return nats.subscribe.mock.calls.filter(([subject]) => subject === `peer.*.${kind}`).slice(-1)[0][1]
  }
  async function deliver(kind = 'cluster_change', wallet = WALLET, session = authority.session): Promise<void> {
    handler(kind)(
      `peer.${wallet}.${kind}`,
      kind === 'connect'
        ? Buffer.from(session)
        : PeerClusterChange.encode(PeerClusterChange.fromPartial({ clusterId: 'hint-only', session })).finish()
    )
    await flushMacrotask()
  }
  function reports(): TakeoverCompleted[] {
    return nats.publishConfirmed.mock.calls
      .filter(([subject]) => subject.endsWith('.takeover_completed'))
      .map(([, data]) => TakeoverCompleted.decode(data))
  }
  function assignments() {
    return nats.publishConfirmed.mock.calls.filter(([subject]) => subject.includes('.island_changed.'))
  }
  function pending(): void {
    authority.pendingTakeovers = [
      { takeoverId: 'takeover-a', displacedSession: OLD_SESSION, displacedClusterId: 'room-a' }
    ]
  }
  beforeEach(async () => {
    now = 1_000_000_400
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    jest.spyOn(timer, 'waitUntil').mockImplementation(async (timestamp) => {
      now = Math.max(now, timestamp)
    })
    numbers = {
      CLUSTER_TAKEOVER_RETRY_DELAY_MS: 0,
      CLUSTER_CLEANUP_CUTOFF_MARGIN_SECONDS: 1,
      CLUSTER_CLEANUP_CLOCK_SKEW_ALLOWANCE_MS: 0
    }
    authority = plan()
    acceptReports = true
    config = createConfigMockedComponent({
      getString: jest
        .fn()
        .mockImplementation(async (key) => (key === 'CLUSTER_SUBSCRIBER_ENABLED' ? 'true' : undefined)),
      getNumber: jest.fn().mockImplementation(async (key) => numbers[key])
    })
    logs = createLoggerMockedComponent({})
    metrics = createMetricsMockedComponent({})
    peerState = createPeerStateMockedComponent()
    nats = createNatsMockedComponent({
      request: jest
        .fn()
        .mockImplementation(async () => ({ status: 'replied', data: PeerClusterChange.encode(authority).finish() }))
    })
    nats.publishConfirmed.mockImplementation(async (subject, data) => {
      if (subject.endsWith('.takeover_completed') && acceptReports) {
        const result = TakeoverCompleted.decode(data)
        if (authority.pendingTakeovers.some((op) => op.takeoverId === result.takeoverId)) {
          authority.pendingTakeovers = authority.pendingTakeovers.filter((op) => op.takeoverId !== result.takeoverId)
          authority.tokenNotBefore = Math.max(authority.tokenNotBefore!, result.revokeBefore)
        }
      }
      return 'confirmed'
    })
    livekit = createLivekitMockedComponent({
      generateCredentials: jest.fn().mockResolvedValue({ url: 'wss://livekit.example', token: 'jwt' }),
      buildConnectionUrl: jest.fn().mockReturnValue('livekit:wss://livekit.example?access_token=jwt')
    })
    accessGate = createAccessGateMockedComponent()
    component = await createClusterSubscriberComponent({
      config,
      logs,
      metrics,
      nats,
      livekit,
      accessGate,
      peerState,
      clusterWalletQueue: await createKeyedQueueTestComponent()
    })
    await component[START_COMPONENT]!(START)
  })
  afterEach(async () => {
    await component[STOP_COMPONENT]!()
    jest.restoreAllMocks()
  })

  describe.each(['cluster_change', 'cluster_snapshot', 'connect'])('and ready authority is triggered by %s', (kind) => {
    it('should deliver credentials only to the exact authoritative session', async () => {
      await deliver(kind)
      expect(assignments()).toEqual([[`engine.peer.${WALLET}.island_changed.${SESSION}`, expect.any(Uint8Array)]])
      expect(livekit.generateCredentials).toHaveBeenCalledWith(
        WALLET,
        'island-room-a',
        { cast: [] },
        false,
        undefined,
        { notBefore: new Date(1_000_000_000), ttlSeconds: 60 }
      )
    })
  })
  describe.each(['no_reply', 'unavailable'])('and authority returns %s', (status) => {
    beforeEach(() => {
      pending()
      nats.request.mockResolvedValue({ status } as any)
    })
    it('should defer both cleanup and credentials', async () => {
      await deliver()
      expect([livekit.removeParticipant.mock.calls, livekit.generateCredentials.mock.calls, reports()]).toEqual([
        [],
        [],
        []
      ])
    })
  })
  describe.each([
    'missing-floor',
    'unsafe-floor',
    'wrong-session',
    'empty-room',
    'duplicate-id',
    'bad-displaced-session'
  ])('and authority has %s', (variant) => {
    beforeEach(() => {
      pending()
      if (variant === 'missing-floor') authority.tokenNotBefore = undefined
      if (variant === 'unsafe-floor') authority.tokenNotBefore = Number.MAX_SAFE_INTEGER
      if (variant === 'wrong-session') authority.session = NEXT_SESSION
      if (variant === 'empty-room') authority.clusterId = ''
      if (variant === 'duplicate-id') authority.pendingTakeovers.push({ ...authority.pendingTakeovers[0] })
      if (variant === 'bad-displaced-session') authority.pendingTakeovers[0].displacedSession = 'invalid'
    })
    it('should fail closed without destructive work', async () => {
      await deliver('connect', WALLET, SESSION)
      expect([livekit.removeParticipant.mock.calls, assignments()]).toEqual([[], []])
    })
  })
  describe('and a same-room takeover hint was lost', () => {
    beforeEach(() => {
      pending()
    })
    it('should recover through lookup, confirm removal and wait for the reported floor', async () => {
      await deliver('connect')
      expect(livekit.removeParticipant).toHaveBeenCalledWith('island-room-a', WALLET, new Date(1_000_001_000))
      expect(reports()).toEqual([{ takeoverId: 'takeover-a', revokeBefore: 1_000_001 }])
      expect(assignments()).toHaveLength(1)
      expect(timer.waitUntil).toHaveBeenCalledWith(1_000_001_000, expect.any(AbortSignal))
    })
    describe('and completion delivery is lost', () => {
      beforeEach(() => {
        acceptReports = false
      })
      it('should resend the same confirmed receipt without a repeated removal or premature mint', async () => {
        await deliver()
        await deliver('cluster_snapshot')
        await deliver('connect')
        expect(livekit.removeParticipant).toHaveBeenCalledTimes(1)
        expect(reports()).toEqual(Array(3).fill({ takeoverId: 'takeover-a', revokeBefore: 1_000_001 }))
        expect(assignments()).toEqual([])
        acceptReports = true
        await deliver('cluster_snapshot')
        expect(livekit.removeParticipant).toHaveBeenCalledTimes(1)
        expect(assignments()).toHaveLength(1)
      })
    })
    describe('and several completions are lost in the same second', () => {
      beforeEach(() => {
        acceptReports = false
        authority.pendingTakeovers.push({
          takeoverId: 'takeover-b',
          displacedSession: SESSION,
          displacedClusterId: 'room-b'
        })
      })
      it('should advance each cutoff beyond retained confirmed receipts', async () => {
        await deliver()
        expect(reports().map((receipt) => receipt.revokeBefore)).toEqual([1_000_001, 1_000_002])
        expect(assignments()).toEqual([])
      })
    })
    describe('and the prior token floor is ahead of the same local second', () => {
      beforeEach(() => {
        authority.tokenNotBefore = 1_000_001
      })
      it('should strictly exceed the previous floor', async () => {
        await deliver()
        expect(reports()[0].revokeBefore).toBe(1_000_002)
      })
    })
    describe('and Cloud rejects without destructive side effects', () => {
      beforeEach(() => {
        livekit.removeParticipant.mockRejectedValueOnce({ code: 'permission_denied', status: 403 })
      })
      it('should retry definite rejection and issue after positive acknowledgement', async () => {
        await deliver()
        expect(livekit.removeParticipant).toHaveBeenCalledTimes(2)
        expect(assignments()).toHaveLength(1)
      })
    })
    describe('and Cloud confirms a departed participant through its application error', () => {
      beforeEach(() => {
        livekit.removeParticipant.mockRejectedValue({
          code: 'not_found',
          status: 404,
          message: 'participant does not exist'
        })
      })
      it('should report revocation and admit after its cutoff without repeating removal', async () => {
        await deliver()
        expect([livekit.removeParticipant.mock.calls.length, reports(), assignments().length]).toEqual([
          1,
          [{ takeoverId: 'takeover-a', revokeBefore: 1_000_001 }],
          1
        ])
      })
    })
    describe('and a settled removal succeeds after its cutoff', () => {
      beforeEach(() => {
        livekit.removeParticipant.mockImplementationOnce(async () => {
          now = 1_000_001_000
        })
      })
      it('should repeat with a strictly higher cutoff before reporting or issuing credentials', async () => {
        await deliver()
        expect([
          livekit.removeParticipant.mock.calls.map(([, , cutoff]) => cutoff),
          reports(),
          assignments().length
        ]).toEqual([
          [new Date(1_000_001_000), new Date(1_000_002_000)],
          [{ takeoverId: 'takeover-a', revokeBefore: 1_000_002 }],
          1
        ])
      })
      describe('and Pulse supersedes the operation before the settled response', () => {
        beforeEach(() => {
          livekit.removeParticipant.mockReset().mockImplementationOnce(async () => {
            now = 1_000_001_000
            authority.session = NEXT_SESSION
            authority.pendingTakeovers = []
          })
        })
        it('should leave the winner untouched and recover only from its fresh hint', async () => {
          await deliver('connect', WALLET, SESSION)
          expect([livekit.removeParticipant.mock.calls.length, reports(), assignments()]).toEqual([1, [], []])
          await deliver('connect')
          expect([livekit.removeParticipant.mock.calls.length, assignments().length]).toEqual([1, 1])
        })
      })
    })
    describe('and every settled removal misses its cutoff', () => {
      beforeEach(() => {
        livekit.removeParticipant.mockImplementation(async (_room, _wallet, cutoff) => {
          now = cutoff!.getTime()
        })
      })
      it('should bound the attempts and recover on a later hint without an unknown quarantine', async () => {
        await deliver()
        expect([livekit.removeParticipant.mock.calls.length, reports(), assignments()]).toEqual([3, [], []])
        livekit.removeParticipant.mockResolvedValue(undefined)
        await deliver('connect')
        expect([livekit.removeParticipant.mock.calls.length, reports(), assignments().length]).toEqual([
          4,
          [{ takeoverId: 'takeover-a', revokeBefore: 1_000_004 }],
          1
        ])
      })
    })
    describe.each(['transport-error', 'generic-404', 'other-not-found'])('and removal produces %s', (outcome) => {
      beforeEach(() => {
        if (outcome === 'transport-error') livekit.removeParticipant.mockRejectedValue(new Error('timeout'))
        if (outcome === 'generic-404') livekit.removeParticipant.mockRejectedValue({ status: 404 })
        if (outcome === 'other-not-found')
          livekit.removeParticipant.mockRejectedValue({
            code: 'not_found',
            status: 404,
            message: 'wrong route'
          })
      })
      it('should retain an unknown outcome block across later assignments in this process', async () => {
        await deliver()
        authority.session = NEXT_SESSION
        authority.clusterId = 'room-c'
        authority.pendingTakeovers.push({
          takeoverId: 'takeover-b',
          displacedSession: SESSION,
          displacedClusterId: 'room-b'
        })
        await deliver('connect')
        await deliver('cluster_snapshot')
        expect([livekit.removeParticipant.mock.calls.length, reports(), assignments()]).toEqual([1, [], []])
      })
    })
    describe('and the takeover ID is replaced during removal', () => {
      beforeEach(() => {
        livekit.removeParticipant.mockImplementation(async () => {
          authority.pendingTakeovers[0].takeoverId = 'takeover-b'
        })
      })
      it('should suppress the stale completion and keep credentials blocked', async () => {
        await deliver()
        expect([reports(), assignments()]).toEqual([[], []])
      })
    })
    describe('and A to B to C preserves unfinished takeover work', () => {
      beforeEach(() => {
        authority.session = NEXT_SESSION
        authority.clusterId = 'room-c'
        authority.pendingTakeovers.push({
          takeoverId: 'takeover-b',
          displacedSession: SESSION,
          displacedClusterId: 'room-b'
        })
      })
      it('should remove both displaced rooms before credentials for C', async () => {
        await deliver()
        expect(livekit.removeParticipant.mock.calls.map(([room]) => room)).toEqual(['island-room-a', 'island-room-b'])
        expect(reports().map((receipt) => receipt.revokeBefore)).toEqual([1_000_001, 1_000_002])
        expect(assignments()[0][0]).toBe(`engine.peer.${WALLET}.island_changed.${NEXT_SESSION}`)
      })
    })
  })
  describe('and membership already holds the ready room', () => {
    beforeEach(() => {
      livekit.holdsParticipant.mockResolvedValue(true)
    })
    it('should suppress duplicate credentials', async () => {
      await deliver()
      await deliver('connect')
      expect([livekit.generateCredentials.mock.calls, livekit.removeParticipant.mock.calls, assignments()]).toEqual([
        [],
        [],
        []
      ])
    })
  })
  describe.each(['presence', 'access', 'banned', 'denylisted', 'signing'])('and issuance fails at %s', (failure) => {
    beforeEach(() => {
      if (failure === 'presence') livekit.holdsParticipant.mockRejectedValue(new Error('unavailable'))
      if (failure === 'access') accessGate.getAccessState.mockRejectedValue(new Error('unavailable'))
      if (failure === 'banned') accessGate.getAccessState.mockResolvedValue({ isBanned: true, isDenylisted: false })
      if (failure === 'denylisted') accessGate.getAccessState.mockResolvedValue({ isBanned: false, isDenylisted: true })
      if (failure === 'signing') livekit.generateCredentials.mockRejectedValue(new Error('signing failed'))
    })
    it('should deliver no credentials', async () => {
      await deliver()
      expect(assignments()).toEqual([])
    })
  })
  describe.each(['presence', 'access'])('and a transient %s outage recovers', (failure) => {
    beforeEach(() => {
      if (failure === 'presence') livekit.holdsParticipant.mockRejectedValueOnce(new Error('unavailable'))
      if (failure === 'access') accessGate.getAccessState.mockRejectedValueOnce(new Error('unavailable'))
    })
    it('should defer admission during the outage and issue after a later authoritative hint', async () => {
      await deliver()
      expect(livekit.generateCredentials).not.toHaveBeenCalled()
      await deliver('cluster_snapshot')
      expect(assignments()).toHaveLength(1)
    })
  })
  describe.each(['new-session', 'new-room', 'pending', 'higher-floor', 'aba'])(
    'and authority changes during signing by %s',
    (change) => {
      beforeEach(() => {
        livekit.generateCredentials.mockImplementation(async () => {
          if (change === 'new-session') authority.session = NEXT_SESSION
          if (change === 'new-room') authority.clusterId = 'room-b'
          if (change === 'pending') pending()
          if (change === 'higher-floor' || change === 'aba') authority.tokenNotBefore = 1_000_001
          // A completed A -> B -> A returns to the same session and room with a unique higher floor.
          return { url: 'wss://livekit.example', token: 'jwt' }
        })
      })
      it('should discard the signed stale credential', async () => {
        await deliver()
        expect(assignments()).toEqual([])
      })
    }
  )
  describe.each(['presence', 'access'])('and a takeover arrives during the %s await', (stage) => {
    beforeEach(() => {
      if (stage === 'presence')
        livekit.holdsParticipant.mockImplementation(async () => {
          pending()
          return false
        })
      if (stage === 'access')
        accessGate.getAccessState.mockImplementation(async () => {
          pending()
          return { isBanned: false, isDenylisted: false }
        })
    })
    it('should recheck the barrier before signing', async () => {
      await deliver()
      expect([livekit.generateCredentials.mock.calls, assignments()]).toEqual([[], []])
    })
  })
  describe('and the ready floor is too far in the future', () => {
    beforeEach(() => {
      authority.tokenNotBefore = 1_000_061
    })
    it('should defer without waiting or signing', async () => {
      await deliver()
      expect([(timer.waitUntil as jest.Mock).mock.calls, livekit.generateCredentials.mock.calls]).toEqual([[], []])
    })
  })
  describe('and the clock rolls back during signing', () => {
    beforeEach(() => {
      livekit.generateCredentials.mockImplementation(async () => {
        now -= 1000
        return { url: 'wss://livekit.example', token: 'jwt' }
      })
    })
    it('should withhold credentials until not-before is valid', async () => {
      await deliver()
      expect(assignments()).toEqual([])
    })
  })
  describe('and removal is requested during a fractional local second', () => {
    beforeEach(() => {
      pending()
    })
    it('should send whole-second revocation timestamps', async () => {
      await deliver()
      expect(livekit.removeParticipant.mock.calls[0][2].getTime() % 1000).toBe(0)
    })
  })
  describe('and the lookup reply is delayed across a takeover', () => {
    let deferred: ReturnType<typeof createDeferred<{ status: 'replied'; data: Uint8Array }>>
    let stale: Uint8Array
    beforeEach(() => {
      stale = PeerClusterChange.encode(authority).finish()
      deferred = createDeferred()
      nats.request.mockImplementationOnce(() => deferred.promise)
    })
    it('should recheck stale positive authority before minting', async () => {
      await deliver()
      authority.session = NEXT_SESSION
      pending()
      deferred.resolve({ status: 'replied', data: stale })
      await flushMacrotask()
      expect(assignments()).toEqual([])
    })
  })
  describe('and credential delivery is dropped', () => {
    beforeEach(() => {
      nats.publishConfirmed.mockResolvedValueOnce('dropped')
    })
    it('should retry delivery from a later positive lookup', async () => {
      await deliver()
      await deliver('connect')
      expect(livekit.generateCredentials).toHaveBeenCalledTimes(2)
      expect(peerState.set).toHaveBeenCalledTimes(1)
    })
  })
  describe('and shutdown occurs during signing', () => {
    beforeEach(() => {
      livekit.generateCredentials.mockImplementation(async () => {
        await component[STOP_COMPONENT]!()
        return { url: 'wss://livekit.example', token: 'jwt' }
      })
    })
    it('should suppress delivery after shutdown', async () => {
      await deliver()
      expect(assignments()).toEqual([])
    })
  })
})

describe('when a takeover receipt cache has capacity one', () => {
  let component: IClusterSubscriberComponent
  let nats: ReturnType<typeof createNatsMockedComponent>
  let livekit: ReturnType<typeof createLivekitMockedComponent>
  let authority: PeerClusterChange
  let acceptReports: boolean
  let now: number
  async function deliver(wallet = WALLET): Promise<void> {
    nats.subscribe.mock.calls.find(([subject]) => subject === 'peer.*.connect')[1](
      `peer.${wallet}.connect`,
      Buffer.from(authority.session)
    )
    await flushMacrotask()
  }
  beforeEach(async () => {
    now = 1_000_000_400
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    authority = plan()
    authority.pendingTakeovers = [{ takeoverId: 'first', displacedSession: OLD_SESSION, displacedClusterId: 'room-a' }]
    acceptReports = false
    nats = createNatsMockedComponent({
      request: jest
        .fn()
        .mockImplementation(async () => ({ status: 'replied', data: PeerClusterChange.encode(authority).finish() }))
    })
    nats.publishConfirmed.mockImplementation(async (subject, data) => {
      if (acceptReports && subject.endsWith('.takeover_completed')) {
        authority.pendingTakeovers = authority.pendingTakeovers.filter(
          (op) => op.takeoverId !== TakeoverCompleted.decode(data).takeoverId
        )
      }
      return 'confirmed'
    })
    livekit = createLivekitMockedComponent({
      generateCredentials: jest.fn().mockResolvedValue({ url: 'wss://livekit.example', token: 'jwt' }),
      buildConnectionUrl: jest.fn().mockReturnValue('livekit:wss://livekit.example?access_token=jwt')
    })
    component = await createClusterSubscriberComponent({
      config: createConfigMockedComponent({
        getString: jest
          .fn()
          .mockImplementation(async (key) => (key === 'CLUSTER_SUBSCRIBER_ENABLED' ? 'true' : undefined)),
        getNumber: jest
          .fn()
          .mockImplementation(async (key) =>
            [
              'CLUSTER_TAKEOVER_RECEIPT_MAX',
              'CLUSTER_SNAPSHOT_CONCURRENCY',
              'CLUSTER_SNAPSHOT_BACKLOG',
              'CLUSTER_CONNECT_CONCURRENCY'
            ].includes(key)
              ? 1
              : undefined
          )
      }),
      logs: createLoggerMockedComponent({}),
      metrics: createMetricsMockedComponent({}),
      nats,
      livekit,
      accessGate: createAccessGateMockedComponent(),
      peerState: createPeerStateMockedComponent(),
      clusterWalletQueue: await createKeyedQueueTestComponent()
    })
    await component[START_COMPONENT]!(START)
  })
  afterEach(async () => {
    await component[STOP_COMPONENT]!()
    jest.restoreAllMocks()
  })
  describe('and a confirmed receipt remains pending', () => {
    beforeEach(() => {
      authority.pendingTakeovers.push({ takeoverId: 'second', displacedSession: SESSION, displacedClusterId: 'room-b' })
    })
    it('should defer the second removal without evicting the first receipt', async () => {
      await deliver()
      await deliver()
      expect(livekit.removeParticipant).toHaveBeenCalledTimes(1)
      expect(livekit.generateCredentials).not.toHaveBeenCalled()
    })
    describe('and a positive read proves the first ID no longer pending', () => {
      it('should reclaim the confirmed receipt and admit the second removal', async () => {
        await deliver()
        authority.pendingTakeovers = authority.pendingTakeovers.filter((op) => op.takeoverId !== 'first')
        await deliver()
        expect(livekit.removeParticipant.mock.calls.map(([room]) => room)).toEqual(['island-room-a', 'island-room-b'])
      })
    })
  })
  describe('and foreground work exhausts the bounded wallet queue', () => {
    let deferred: ReturnType<typeof createDeferred<{ status: 'no_reply' }>>
    beforeEach(() => {
      deferred = createDeferred()
      nats.request.mockImplementation(() => deferred.promise)
    })
    it('should defer overflow hints until a later retry', async () => {
      await deliver()
      await deliver()
      await deliver()
      await deliver()
      expect(nats.request).toHaveBeenCalledTimes(1)
      deferred.resolve({ status: 'no_reply' })
      await flushMacrotask()
      expect(nats.request).toHaveBeenCalledTimes(3)
    })
  })
  describe('and the wallet with a confirmed receipt departs', () => {
    beforeEach(async () => {
      await deliver()
      authority.pendingTakeovers = [{ takeoverId: 'second', displacedSession: SESSION, displacedClusterId: 'room-b' }]
      acceptReports = true
      now = 1_000_065_999
    })
    it('should reserve the receipt through its cutoff, token lifetime and skew allowance', async () => {
      await deliver('0x2222222222222222222222222222222222222222')
      expect(livekit.removeParticipant).toHaveBeenCalledTimes(1)
    })
    describe('and the receipt retention boundary has elapsed', () => {
      beforeEach(() => {
        now = 1_000_066_000
      })
      it('should reclaim capacity so an unrelated wallet can finish its takeover', async () => {
        await deliver('0x2222222222222222222222222222222222222222')
        expect([
          livekit.removeParticipant.mock.calls.map(([room]) => room),
          livekit.generateCredentials.mock.calls.length
        ]).toEqual([['island-room-a', 'island-room-b'], 1])
      })
    })
  })
  describe('and removal succeeds inside the clock skew reserve', () => {
    let timestamp: number
    beforeEach(() => {
      timestamp = 1_000_000_400
      jest.spyOn(Date, 'now').mockImplementation(() => timestamp)
      livekit.removeParticipant.mockImplementation(async () => {
        timestamp = 1_000_004_000
      })
    })
    it('should repeat the settled removal with a higher cutoff outside the skew reserve', async () => {
      await deliver()
      await deliver()
      expect([
        livekit.removeParticipant.mock.calls.map(([, , cutoff]) => cutoff),
        nats.publishConfirmed.mock.calls.length
      ]).toEqual([[new Date(1_000_005_000), new Date(1_000_009_000)], 2])
    })
  })
  describe('and removal outcome is unknown', () => {
    beforeEach(() => {
      livekit.removeParticipant.mockRejectedValue(new Error('timeout'))
    })
    it('should retain the block even after the pending ID disappears', async () => {
      await deliver()
      authority.pendingTakeovers = [{ takeoverId: 'second', displacedSession: SESSION, displacedClusterId: 'room-b' }]
      await deliver()
      expect([livekit.removeParticipant.mock.calls.length, livekit.generateCredentials.mock.calls]).toEqual([1, []])
    })
  })
})
