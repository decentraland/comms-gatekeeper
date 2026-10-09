import {
  PeerClusterChange,
  RoomAdmissionState,
  RoomCleanupCompleted
} from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { START_COMPONENT, STOP_COMPONENT, IBaseComponent } from '@well-known-components/interfaces'
import { IslandChangedMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import * as timer from '../../../src/utils/timer'
import { createClusterSubscriberComponent, IClusterSubscriberComponent } from '../../../src/logic/cluster-subscriber'
import { CleanupReceipt } from '../../../src/adapters/room-cleanup-journal'
import { createRoomCleanupJournalMockedComponent } from '../../mocks/room-cleanup-journal-mock'
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
const START: IBaseComponent.ComponentStartOptions = { started: () => true, live: () => true, getComponents: () => ({}) }
function plan(): PeerClusterChange {
  return PeerClusterChange.fromPartial({
    clusterId: 'room-a',
    realm: 'main',
    session: SESSION,
    roomRecovery: {
      epoch: 'epoch-a',
      revision: '1',
      admission: RoomAdmissionState.READY,
      operations: [],
      tokenNotBefore: 0
    }
  })
}

describe('when executing Pulse-owned room plans', () => {
  let component: IClusterSubscriberComponent
  let nats: ReturnType<typeof createNatsMockedComponent>
  let livekit: ReturnType<typeof createLivekitMockedComponent>
  let accessGate: ReturnType<typeof createAccessGateMockedComponent>
  let journal: ReturnType<typeof createRoomCleanupJournalMockedComponent>
  let peerState: ReturnType<typeof createPeerStateMockedComponent>
  let metrics: ReturnType<typeof createMetricsMockedComponent>
  let config: ReturnType<typeof createConfigMockedComponent>
  let logs: ReturnType<typeof createLoggerMockedComponent>
  let authority: PeerClusterChange
  let rows: Map<string, CleanupReceipt>
  let acceptReports: boolean
  let now: number
  let numbers: Record<string, number>
  async function createSubscriber(): Promise<IClusterSubscriberComponent> {
    return createClusterSubscriberComponent({
      config,
      logs,
      metrics,
      nats,
      livekit,
      accessGate,
      peerState,
      roomCleanupJournal: journal,
      clusterWalletQueue: await createKeyedQueueTestComponent()
    })
  }
  function rowKey(wallet: string, epoch: string, op: string): string {
    return JSON.stringify([wallet, epoch, op])
  }
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
  function reports(): RoomCleanupCompleted[] {
    return nats.publishConfirmed.mock.calls
      .filter(([subject]) => subject.endsWith('.room_cleanup_completed'))
      .map(([, data]) => RoomCleanupCompleted.decode(data))
  }
  function assignments() {
    return nats.publishConfirmed.mock.calls.filter(([subject]) => subject.includes('.island_changed.'))
  }
  function pending(): void {
    authority.roomRecovery.admission = RoomAdmissionState.PENDING
    authority.roomRecovery.operations = [{ operationId: 'op-a', clusterId: 'room-a', minimumRevokeBefore: 0 }]
  }
  async function restart(): Promise<void> {
    await component[STOP_COMPONENT]!()
    // Explicit restart must lose the subscriber's private success cache while keeping PostgreSQL state.
    component = await createSubscriber()
    await component[START_COMPONENT]!(START)
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
    rows = new Map()
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
      if (subject.endsWith('.room_cleanup_completed') && acceptReports) {
        const result = RoomCleanupCompleted.decode(data)
        if (result.epoch === authority.roomRecovery.epoch && result.revision === authority.roomRecovery.revision) {
          authority.roomRecovery.operations = authority.roomRecovery.operations.filter(
            (op) => op.operationId !== result.operationId
          )
          if (!result.observedReady && result.clusterId === authority.clusterId)
            authority.roomRecovery.tokenNotBefore = result.revokeBefore
          if (!authority.roomRecovery.operations.length) authority.roomRecovery.admission = RoomAdmissionState.READY
        }
      }
      return 'confirmed'
    })
    livekit = createLivekitMockedComponent({
      generateCredentials: jest.fn().mockResolvedValue({ url: 'wss://livekit.example', token: 'jwt' }),
      buildConnectionUrl: jest.fn().mockReturnValue('livekit:wss://livekit.example?access_token=jwt')
    })
    accessGate = createAccessGateMockedComponent()
    journal = createRoomCleanupJournalMockedComponent({
      hasUnfinished: jest
        .fn()
        .mockImplementation(async (wallet) =>
          [...rows.values()].some((row) => row.wallet === wallet && row.state === 'dispatched')
        ),
      get: jest.fn().mockImplementation(async (wallet, epoch, op) => rows.get(rowKey(wallet, epoch, op))),
      dispatch: jest.fn().mockImplementation(async (input) => {
        const key = rowKey(input.wallet, input.epoch, input.operationId)
        if (rows.has(key)) return false
        rows.set(key, { ...input, state: 'dispatched' })
        return true
      }),
      confirm: jest.fn().mockImplementation(async (input, cutoff = input.revokeBefore) => {
        rows.set(rowKey(input.wallet, input.epoch, input.operationId), {
          ...input,
          revokeBefore: cutoff,
          state: 'confirmed'
        })
      }),
      cancelDefiniteFailure: jest.fn().mockImplementation(async (input) => {
        rows.delete(rowKey(input.wallet, input.epoch, input.operationId))
      }),
      pruneConfirmed: jest.fn().mockImplementation(async (wallet, epoch, ids) => {
        for (const [key, row] of rows)
          if (
            row.wallet === wallet &&
            row.state === 'confirmed' &&
            (row.epoch !== epoch || !ids.includes(row.operationId))
          )
            rows.delete(key)
      })
    })
    component = await createSubscriber()
    await component[START_COMPONENT]!(START)
  })
  afterEach(async () => {
    await component[STOP_COMPONENT]!()
    jest.restoreAllMocks()
  })

  describe.each(['cluster_change', 'cluster_snapshot', 'connect'])('and ready authority is triggered by %s', (kind) => {
    it('should issue ordinary credentials to the exact session after positive authority checks', async () => {
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
      expect(livekit.removeParticipant).not.toHaveBeenCalled()
    })
  })
  describe('and the participant already holds its ready room', () => {
    beforeEach(() => {
      livekit.holdsParticipant.mockResolvedValue(true)
    })
    it('should preserve it on duplicate hints', async () => {
      await deliver()
      await deliver('connect')
      expect([livekit.removeParticipant.mock.calls, livekit.generateCredentials.mock.calls, assignments()]).toEqual([
        [],
        [],
        []
      ])
    })
  })
  describe.each(['no_reply', 'unavailable'])('and authority returns %s', (status) => {
    beforeEach(() => {
      pending()
      nats.request.mockResolvedValue({ status } as any)
    })
    it('should defer cleanup and credentials', async () => {
      await deliver()
      expect([livekit.removeParticipant.mock.calls, livekit.generateCredentials.mock.calls, reports()]).toEqual([
        [],
        [],
        []
      ])
    })
  })
  describe.each([
    'missing',
    'unspecified',
    'bootstrap',
    'invalid-revision',
    'duplicate-room',
    'unsafe-cutoff',
    'wrong-session'
  ])('and authority is %s', (variant) => {
    beforeEach(() => {
      if (variant === 'missing') authority.roomRecovery = undefined
      if (variant === 'unspecified') authority.roomRecovery.admission = RoomAdmissionState.UNSPECIFIED
      if (variant === 'bootstrap') authority.roomRecovery.bootstrapRequired = true
      if (variant === 'invalid-revision') authority.roomRecovery.revision = '01'
      if (variant === 'wrong-session') authority.session = NEXT_SESSION
      if (variant === 'unsafe-cutoff') authority.roomRecovery.tokenNotBefore = Number.MAX_SAFE_INTEGER
      if (variant === 'duplicate-room') {
        pending()
        authority.roomRecovery.operations.push({ operationId: 'op-b', clusterId: 'room-a', minimumRevokeBefore: 0 })
      }
    })
    it('should reject all security side effects', async () => {
      await deliver('connect', WALLET, SESSION)
      expect([livekit.removeParticipant.mock.calls, livekit.generateCredentials.mock.calls]).toEqual([[], []])
    })
  })
  describe('and a same-room takeover is pending', () => {
    beforeEach(() => {
      pending()
      livekit.holdsParticipant.mockResolvedValue(true)
    })
    it('should revoke a present wallet before admitting the winner and preserve later joined hints', async () => {
      await deliver()
      await deliver('cluster_snapshot')
      expect(livekit.removeParticipant).toHaveBeenCalledTimes(1)
      expect(livekit.removeParticipant).toHaveBeenCalledWith('island-room-a', WALLET, new Date(1_000_001_000))
      expect(reports()).toEqual([
        {
          epoch: 'epoch-a',
          revision: '1',
          operationId: 'op-a',
          clusterId: 'room-a',
          revokeBefore: 1_000_001,
          observedReady: false
        }
      ])
    })
    describe('and the wallet is absent after cleanup', () => {
      beforeEach(() => {
        livekit.holdsParticipant.mockResolvedValue(false)
      })
      it('should sign only after recorded readiness using its cutoff', async () => {
        await deliver()
        expect(livekit.generateCredentials.mock.calls[0][5]).toEqual({
          notBefore: new Date(1_000_001_000),
          ttlSeconds: 60
        })
        expect(assignments()).toHaveLength(1)
      })
    })
  })
  describe.each(['dropped', 'unconfirmed', 'confirmed', 'throw'])(
    'and a completion report ends %s without Pulse accepting it',
    (outcome) => {
      beforeEach(() => {
        pending()
        acceptReports = false
        if (outcome === 'throw') nats.publishConfirmed.mockRejectedValue(new Error('transport'))
        else nats.publishConfirmed.mockResolvedValue(outcome as any)
      })
      it('should rereport the same confirmed result even after the Cloud cutoff window without removing again', async () => {
        await deliver()
        now += 120_000
        await deliver('cluster_snapshot')
        expect(livekit.removeParticipant).toHaveBeenCalledTimes(1)
        expect(reports()).toHaveLength(2)
        expect(reports()[1].revokeBefore).toBe(1_000_001)
        expect(livekit.generateCredentials).not.toHaveBeenCalled()
      })
    }
  )
  describe('and a lost completion later reaches Pulse', () => {
    beforeEach(() => {
      pending()
      acceptReports = false
    })
    it('should recover credentials on a later hint without another removal', async () => {
      await deliver()
      acceptReports = true
      await deliver('connect')
      expect(livekit.removeParticipant).toHaveBeenCalledTimes(1)
      expect(assignments()).toHaveLength(1)
    })
  })
  describe.each(['timeout', 'not_found', 'internal', 'unavailable'])('and removal ends with ambiguous %s', (code) => {
    beforeEach(() => {
      pending()
      livekit.removeParticipant.mockRejectedValue({ status: 500, code })
    })
    it('should block hints, newer plans and a restarted process through its durable dispatch', async () => {
      await deliver()
      authority = plan()
      authority.roomRecovery.epoch = 'epoch-b'
      await deliver('connect')
      await restart()
      await deliver('connect')
      expect(livekit.removeParticipant).toHaveBeenCalledTimes(1)
      expect(livekit.generateCredentials).not.toHaveBeenCalled()
      expect([...rows.values()][0].state).toBe('dispatched')
    })
  })
  describe('and Cloud success cannot be persisted', () => {
    beforeEach(() => {
      pending()
      journal.confirm.mockRejectedValueOnce(new Error('DB unavailable'))
    })
    it('should retry only known success persistence within this process', async () => {
      await deliver()
      expect(assignments()).toHaveLength(0)
      await deliver('connect')
      expect(livekit.removeParticipant).toHaveBeenCalledTimes(1)
      expect(journal.confirm).toHaveBeenCalledTimes(2)
      expect(assignments()).toHaveLength(1)
    })
    it('should remain blocked after a crash loses that local evidence', async () => {
      await deliver()
      await restart()
      await deliver('connect')
      expect(livekit.generateCredentials).not.toHaveBeenCalled()
      expect(reports()).toHaveLength(0)
    })
  })
  describe('and the durable journal is unavailable or full', () => {
    beforeEach(() => {
      pending()
      journal.dispatch.mockResolvedValue(false)
    })
    it('should refuse Cloud dispatch and credentials', async () => {
      await deliver()
      expect([livekit.removeParticipant.mock.calls, livekit.generateCredentials.mock.calls]).toEqual([[], []])
    })
  })
  describe('and a definite rejection is retried', () => {
    beforeEach(() => {
      pending()
      livekit.removeParticipant.mockImplementationOnce(async () => {
        now += 70_000
        throw { status: 400, code: 'invalid_argument' }
      })
    })
    it('should use a fresh cutoff for the new attempt', async () => {
      await deliver()
      expect(livekit.removeParticipant.mock.calls.map((call) => call[2])).toEqual([
        new Date(1_000_001_000),
        new Date(1_000_071_000)
      ])
      expect(assignments()).toHaveLength(1)
    })
  })
  describe.each(['journal', 'authority'])('and the %s await after dispatch admission advances time', (path) => {
    beforeEach(() => {
      pending()
      const dispatch = journal.dispatch.getMockImplementation()!
      journal.dispatch.mockImplementationOnce(async (input) => {
        const recorded = await dispatch(input)
        if (path === 'journal') now += 70_000
        else
          nats.request.mockImplementationOnce(async () => {
            now += 70_000
            return { status: 'replied', data: PeerClusterChange.encode(authority).finish() }
          })
        return recorded
      })
    })
    it('should compute the actual Cloud cutoff after the last await and durably confirm that cutoff', async () => {
      await deliver()
      expect(livekit.removeParticipant.mock.calls[0][2]).toEqual(new Date(1_000_071_000))
      expect(journal.confirm).toHaveBeenCalledWith(expect.objectContaining({ revokeBefore: 1_000_001 }), 1_000_071)
      expect(reports()[0].revokeBefore).toBe(1_000_071)
      expect(livekit.generateCredentials.mock.calls[0][5].notBefore).toEqual(new Date(1_000_071_000))
    })
  })
  describe('and Cloud success returns after its effective revocation cutoff', () => {
    beforeEach(() => {
      pending()
      livekit.removeParticipant.mockImplementationOnce(async () => {
        now += 2000
      })
    })
    it('should retain the durable uncertainty block instead of admitting potentially refreshed old tokens', async () => {
      await deliver()
      await deliver('connect')
      await restart()
      await deliver('connect')
      expect(journal.confirm).not.toHaveBeenCalled()
      expect([...rows.values()][0].state).toBe('dispatched')
      expect([reports(), assignments()]).toEqual([[], []])
    })
  })
  describe('and a new session takes over in the same second', () => {
    beforeEach(() => {
      pending()
    })
    it('should strictly advance beyond the previously admitted token nbf', async () => {
      await deliver()
      authority = plan()
      authority.session = NEXT_SESSION
      authority.roomRecovery.revision = '2'
      pending()
      authority.roomRecovery.operations[0] = {
        operationId: 'op-b',
        clusterId: 'room-a',
        minimumRevokeBefore: 1_000_002
      }
      await deliver()
      expect(livekit.removeParticipant.mock.calls.map((call) => call[2])).toEqual([
        new Date(1_000_001_000),
        new Date(1_000_002_000)
      ])
      expect(livekit.generateCredentials.mock.calls.map((call) => call[5].notBefore)).toEqual([
        new Date(1_000_001_000),
        new Date(1_000_002_000)
      ])
    })
  })
  describe('and a rapid takeover exceeds the Cloud horizon', () => {
    beforeEach(() => {
      pending()
      authority.roomRecovery.operations[0].minimumRevokeBefore = 1_000_061
    })
    it('should wait for a legal horizon without clamping the cutoff', async () => {
      await deliver()
      expect(livekit.removeParticipant).not.toHaveBeenCalled()
      now += 2000
      await deliver('connect')
      expect(livekit.removeParticipant.mock.calls[0][2]).toEqual(new Date(1_000_061_000))
    })
  })
  describe.each(['departure', 'banned'])('and retained cleanup belongs to a %s wallet', (kind) => {
    beforeEach(() => {
      pending()
      accessGate.getAccessState.mockResolvedValue({ isBanned: true, isDenylisted: false })
      if (kind === 'departure') {
        authority.clusterId = ''
        authority.roomRecovery.cleanupOnly = true
      }
    })
    it('should finish revocation but never mint', async () => {
      await deliver('cluster_snapshot')
      expect(reports().filter((report) => !report.observedReady)).toHaveLength(1)
      expect(livekit.generateCredentials).not.toHaveBeenCalled()
    })
  })
  describe.each(['membership', 'access'])('and the %s check fails', (path) => {
    beforeEach(() => {
      if (path === 'membership') livekit.holdsParticipant.mockRejectedValue(new Error('API'))
      else accessGate.getAccessState.mockRejectedValue(new Error('DB'))
    })
    it('should fail closed on every trigger', async () => {
      await deliver()
      await deliver('connect')
      expect(livekit.generateCredentials).not.toHaveBeenCalled()
    })
  })
  describe.each(['membership', 'access', 'mint'])('and the plan changes during %s', (path) => {
    beforeEach(() => {
      function change() {
        authority.roomRecovery.revision = '2'
        authority.clusterId = 'room-b'
      }
      if (path === 'membership')
        livekit.holdsParticipant.mockImplementationOnce(async () => {
          change()
          return false
        })
      if (path === 'access')
        accessGate.getAccessState.mockImplementationOnce(async () => {
          change()
          return { isBanned: false, isDenylisted: false }
        })
      if (path === 'mint')
        livekit.generateCredentials.mockImplementationOnce(async () => {
          change()
          return { url: 'wss://livekit.example', token: 'old' }
        })
    })
    it('should discard stale publication and recover the current room on the next hint', async () => {
      await deliver()
      expect(assignments()).toHaveLength(0)
      await deliver('connect')
      expect(assignments()).toHaveLength(1)
      expect(livekit.generateCredentials.mock.calls.slice(-1)[0][1]).toBe('island-room-b')
    })
  })
  describe('and the plan changes during removal', () => {
    beforeEach(() => {
      pending()
      livekit.removeParticipant.mockImplementationOnce(async () => {
        authority.roomRecovery.revision = '2'
        authority.roomRecovery.operations[0].operationId = 'op-b'
      })
    })
    it('should preserve the confirmed receipt without clearing the new operation', async () => {
      await deliver()
      expect(reports()).toHaveLength(0)
      expect(livekit.generateCredentials).not.toHaveBeenCalled()
      expect([...rows.values()][0].state).toBe('confirmed')
    })
  })
  describe('and a stable unfinished room operation is carried into a newer revision', () => {
    beforeEach(() => {
      pending()
      livekit.removeParticipant.mockImplementationOnce(async () => {
        authority.roomRecovery.revision = '2'
      })
    })
    it('should rereport confirmed work under the newer plan without another removal', async () => {
      await deliver()
      expect(reports()).toHaveLength(0)
      await deliver('connect')
      expect(livekit.removeParticipant).toHaveBeenCalledTimes(1)
      expect(reports()[0]).toMatchObject({ revision: '2', operationId: 'op-a', observedReady: false })
      expect(assignments()).toHaveLength(1)
    })
  })
  describe('and a late acknowledgement clears the operation between journaling and Cloud dispatch', () => {
    beforeEach(() => {
      pending()
      const dispatch = journal.dispatch.getMockImplementation()!
      journal.dispatch.mockImplementationOnce(async (input) => {
        const recorded = await dispatch(input)
        authority.roomRecovery.admission = RoomAdmissionState.READY
        authority.roomRecovery.operations = []
        return recorded
      })
    })
    it('should cancel the known no-call record and avoid removing the admitted room', async () => {
      await deliver()
      expect(livekit.removeParticipant).not.toHaveBeenCalled()
      expect(journal.cancelDefiniteFailure).toHaveBeenCalledTimes(1)
      expect(rows.size).toBe(0)
      await deliver('connect')
      expect(assignments()).toHaveLength(1)
    })
  })
  describe('and completed departure must retire both Pulse state and confirmed journal receipts', () => {
    beforeEach(() => {
      pending()
      authority.clusterId = ''
      authority.realm = ''
      authority.roomRecovery.cleanupOnly = true
    })
    it('should observe exact ready departure only after pruning confirmed receipts and never mint', async () => {
      await deliver('cluster_snapshot')
      expect(rows.size).toBe(0)
      expect(reports().filter((report) => report.observedReady)).toEqual([
        { epoch: 'epoch-a', revision: '1', operationId: '', clusterId: '', revokeBefore: 0, observedReady: true }
      ])
      await deliver('cluster_snapshot')
      expect(reports().filter((report) => report.observedReady)).toHaveLength(2)
      expect(livekit.removeParticipant).toHaveBeenCalledTimes(1)
      expect(assignments()).toHaveLength(0)
    })
    describe('and confirmed pruning fails', () => {
      beforeEach(() => {
        journal.pruneConfirmed.mockImplementation(async (_wallet, _epoch, ids) => {
          if (ids.length === 0) throw new Error('database unavailable')
        })
      })
      it('should leave Pulse retirement unobserved', async () => {
        await deliver()
        expect(reports().some((report) => report.observedReady)).toBe(false)
        expect(rows.size).toBe(1)
      })
    })
  })
  describe('and stop occurs during removal', () => {
    let removal: ReturnType<typeof createDeferred<void>>
    beforeEach(() => {
      pending()
      removal = createDeferred<void>()
      livekit.removeParticipant.mockReturnValue(removal.promise)
    })
    it('should persist confirmed results but prevent subsequent report and mint', async () => {
      await deliver()
      await component[STOP_COMPONENT]!()
      removal.resolve(undefined)
      await flushMacrotask()
      expect([...rows.values()][0].state).toBe('confirmed')
      expect([reports(), livekit.generateCredentials.mock.calls]).toEqual([[], []])
    })
  })
  describe('and snapshot recovery is busy', () => {
    let membership: ReturnType<typeof createDeferred<boolean>>
    let walletList: string[]
    beforeEach(() => {
      membership = createDeferred<boolean>()
      walletList = Array.from({ length: 100 }, (_, index) => `0x${(index + 1).toString(16).padStart(40, '0')}`)
      livekit.holdsParticipant.mockReturnValue(membership.promise)
    })
    afterEach(async () => {
      membership.resolve(true)
      await flushMacrotask()
    })
    it('should cap concurrent recovery and coalesce active-wallet hints', async () => {
      for (const wallet of walletList)
        handler('cluster_snapshot')(`peer.${wallet}.cluster_snapshot`, PeerClusterChange.encode(authority).finish())
      await flushMacrotask()
      expect(livekit.holdsParticipant).toHaveBeenCalledTimes(16)
      await deliver('cluster_snapshot', walletList[0])
      expect(livekit.holdsParticipant).toHaveBeenCalledTimes(16)
    })
  })

  describe('and ready admission waits for its revocation boundary', () => {
    let wait: ReturnType<typeof createDeferred<void>>
    beforeEach(() => {
      authority.roomRecovery.tokenNotBefore = 1_000_005
      wait = createDeferred<void>()
      jest.mocked(timer.waitUntil).mockImplementation(() => wait.promise)
    })
    afterEach(async () => {
      wait.resolve(undefined)
      await flushMacrotask()
    })
    it('should perform fresh presence, access and authority checks only after the boundary', async () => {
      await deliver()
      expect(assignments()).toHaveLength(0)
      expect(livekit.holdsParticipant).not.toHaveBeenCalled()
      expect(accessGate.getAccessState).not.toHaveBeenCalled()
      now = 1_000_005_000
      wait.resolve(undefined)
      await flushMacrotask()
      expect(assignments()).toHaveLength(1)
      expect(livekit.generateCredentials.mock.calls[0][5].notBefore.getTime()).toBeLessThanOrEqual(now)
    })
    it.each(['new-plan', 'higher-floor', 'unfinished', 'banned', 'stop'])(
      'should defer when %s arrives during the wait',
      async (change) => {
        await deliver()
        if (change === 'new-plan') authority.roomRecovery.revision = '2'
        if (change === 'higher-floor') authority.roomRecovery.tokenNotBefore++
        if (change === 'unfinished') journal.hasUnfinished.mockResolvedValue(true)
        if (change === 'banned') accessGate.getAccessState.mockResolvedValue({ isBanned: true, isDenylisted: false })
        if (change === 'stop') await component[STOP_COMPONENT]!()
        now = 1_000_005_000
        wait.resolve(undefined)
        await flushMacrotask()
        expect(livekit.generateCredentials).not.toHaveBeenCalled()
        expect(assignments()).toHaveLength(0)
      }
    )
  })

  describe('and Cloud clock skew is bounded by one second', () => {
    beforeEach(async () => {
      numbers.CLUSTER_CLEANUP_CLOCK_SKEW_ALLOWANCE_MS = 1000
      await restart()
    })
    it('should issue an initial token valid even when the Cloud clock is one second behind', async () => {
      await deliver()
      expect(assignments()).toHaveLength(1)
      expect(livekit.generateCredentials.mock.calls[0][5].notBefore.getTime()).toBeLessThanOrEqual(now - 1000)
    })
    it('should increase the one-second configured margin and wait through the clock reserve', async () => {
      pending()
      await deliver()
      expect(livekit.removeParticipant.mock.calls[0][2]).toEqual(new Date(1_000_002_000))
      expect(jest.mocked(timer.waitUntil)).toHaveBeenCalledWith(1_000_003_000, expect.any(AbortSignal))
      expect(livekit.generateCredentials.mock.calls[0][5].notBefore.getTime()).toBeLessThanOrEqual(now - 1000)
      expect(assignments()).toHaveLength(1)
    })
    it('should quarantine a response before the local cutoff but outside the positive skew reserve', async () => {
      pending()
      livekit.removeParticipant.mockImplementationOnce(async () => {
        now = 1_000_001_500
      })
      await deliver()
      expect(journal.confirm).not.toHaveBeenCalled()
      expect([...rows.values()][0].state).toBe('dispatched')
      expect([reports(), assignments()]).toEqual([[], []])
    })
    it('should discard signed credentials when the local clock rolls backward across their reserve', async () => {
      livekit.generateCredentials.mockImplementationOnce(async () => {
        now -= 2000
        return { url: 'wss://livekit.example', token: 'rollback' }
      })
      await deliver()
      expect(assignments()).toHaveLength(0)
    })
  })
  describe.each([-1, 5001, 1.5, undefined])('and clock reserve configuration is invalid (%s)', (setting) => {
    beforeEach(async () => {
      numbers.CLUSTER_CLEANUP_CLOCK_SKEW_ALLOWANCE_MS = setting
      await restart()
      pending()
    })
    it('should retain the default one-second reserve', async () => {
      await deliver()
      expect(livekit.removeParticipant.mock.calls[0][2]).toEqual(new Date(1_000_002_000))
      expect(jest.mocked(timer.waitUntil)).toHaveBeenCalledWith(1_000_003_000, expect.any(AbortSignal))
    })
  })

  describe('and bounded scheduling receives multiple wallets', () => {
    const wallets = [
      WALLET,
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333',
      '0x4444444444444444444444444444444444444444'
    ]
    let blocks: ReturnType<typeof createDeferred<boolean>>[]
    beforeEach(async () => {
      numbers.CLUSTER_CONNECT_CONCURRENCY = 1
      numbers.CLUSTER_SNAPSHOT_CONCURRENCY = 1
      numbers.CLUSTER_SNAPSHOT_BACKLOG = 1
      await restart()
      blocks = wallets.map(() => createDeferred<boolean>())
      livekit.holdsParticipant.mockImplementation(async (_room, wallet) => blocks[wallets.indexOf(wallet)].promise)
      nats.request.mockImplementation(async (_subject, selector) => {
        const entry = plan()
        entry.session = Buffer.from(selector).toString()
        return { status: 'replied', data: PeerClusterChange.encode(entry).finish() }
      })
    })
    afterEach(async () => {
      blocks.forEach((block) => block.resolve(true))
      await flushMacrotask()
    })
    it('should transfer connect slots in FIFO order without exceeding concurrency', async () => {
      for (const wallet of wallets) await deliver('connect', wallet)
      expect(livekit.holdsParticipant.mock.calls.map((call) => call[1])).toEqual([wallets[0]])
      for (let index = 0; index < wallets.length; index++) {
        blocks[index].resolve(true)
        await flushMacrotask()
        expect(livekit.holdsParticipant.mock.calls.map((call) => call[1])).toEqual(
          wallets.slice(0, Math.min(index + 2, wallets.length))
        )
      }
    })
    it('should keep the latest queued snapshot selector and bound overflow', async () => {
      await deliver('cluster_snapshot', wallets[0])
      await deliver('cluster_snapshot', wallets[1], SESSION)
      await deliver('cluster_snapshot', wallets[1], NEXT_SESSION)
      await deliver('cluster_snapshot', wallets[2])
      expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_snapshot_overflow_total')
      blocks[0].resolve(true)
      await flushMacrotask()
      const lookup = nats.request.mock.calls.find(([subject]) => subject.includes(wallets[1]))
      expect(Buffer.from(lookup[1]).toString()).toBe(NEXT_SESSION)
      expect(livekit.holdsParticipant.mock.calls.map((call) => call[1])).toEqual(wallets.slice(0, 2))
    })
    it('should release a failed snapshot slot and allow ordinary changes while snapshots are busy', async () => {
      await deliver('cluster_snapshot', wallets[0])
      await deliver('cluster_snapshot', wallets[1])
      await deliver('cluster_change', wallets[2])
      expect(livekit.holdsParticipant.mock.calls.map((call) => call[1])).toEqual([wallets[0], wallets[2]])
      blocks[0].reject(new Error('membership unavailable'))
      await flushMacrotask()
      expect(livekit.holdsParticipant.mock.calls.map((call) => call[1])).toEqual([wallets[0], wallets[2], wallets[1]])
    })
    it('should discard queued snapshots and connects on shutdown', async () => {
      await deliver('cluster_snapshot', wallets[0])
      await deliver('cluster_snapshot', wallets[1])
      await deliver('connect', wallets[2])
      await deliver('connect', wallets[3])
      await component[STOP_COMPONENT]!()
      blocks[0].resolve(true)
      blocks[2].resolve(true)
      await flushMacrotask()
      expect(livekit.holdsParticipant.mock.calls.map((call) => call[1])).toEqual([wallets[0], wallets[2]])
      expect(assignments()).toHaveLength(0)
    })
  })

  describe('and wallet work must remain serialized', () => {
    it('should wait behind signing and publish fromIslandId in wallet order', async () => {
      const signing = createDeferred<{ url: string; token: string }>()
      const state = new Map()
      peerState.get.mockImplementation((wallet) => state.get(wallet))
      peerState.set.mockImplementation((wallet, value) => {
        state.set(wallet, value)
      })
      livekit.generateCredentials.mockReturnValueOnce(signing.promise)
      await deliver('connect')
      await deliver('cluster_change')
      expect(livekit.generateCredentials).toHaveBeenCalledTimes(1)
      signing.resolve({ url: 'wss://livekit.example', token: 'first' })
      await flushMacrotask()
      expect(assignments()).toHaveLength(2)
      expect(IslandChangedMessage.decode(assignments()[1][1]).fromIslandId).toBe('island-room-a')
    })
    it('should not retain peer state after a dropped assignment', async () => {
      nats.publishConfirmed.mockResolvedValue('dropped')
      await deliver()
      expect(peerState.set).not.toHaveBeenCalled()
      expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_cluster_publish_failed_total')
    })
  })

  describe.each(['disabled', 'unconfigured'])('and lifecycle is %s', (mode) => {
    it('should stay idle without subscriptions or broker connection', async () => {
      await component[STOP_COMPONENT]!()
      nats.subscribe.mockClear()
      nats.connect.mockClear()
      if (mode === 'disabled') config.getString.mockResolvedValue('false')
      else nats.isEnabled.mockReturnValue(false)
      component = await createSubscriber()
      await component[START_COMPONENT]!(START)
      expect(nats.subscribe).not.toHaveBeenCalled()
      expect(nats.connect).not.toHaveBeenCalled()
    })
  })
})
