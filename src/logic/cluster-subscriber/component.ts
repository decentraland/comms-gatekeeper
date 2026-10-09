import { IslandChangedMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import {
  PeerClusterChange,
  RoomAdmissionState,
  RoomCleanupCompleted,
  RoomCleanupOperation
} from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { setMaxListeners } from 'events'
import { NatsMessageHandler, NatsSubscription } from '../../adapters/nats'
import { CleanupDispatch } from '../../adapters/room-cleanup-journal'
import { getErrorMessage } from '../errors'
import { AppComponents } from '../../types'
import { positiveIntegerOr, positiveNumberOr } from '../../utils/config'
import { waitUntil } from '../../utils/timer'
import { IClusterSubscriberComponent } from './types'

const SESSION_KEY = /^0x[0-9a-f]{40}$/
const TAKEOVER_ATTEMPTS = 3

function safeLabel(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\s\x00-\x1f]/.test(value)
}
function safeSeconds(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= Math.floor(Number.MAX_SAFE_INTEGER / 1000)
}
/** Only affirmative application rejections with no destructive side effect permit retry. */
function isDefiniteRejection(error: unknown): boolean {
  const failure = error as { code?: unknown; status?: unknown } | undefined
  return (
    !!failure &&
    typeof failure.status === 'number' &&
    ['invalid_argument', 'permission_denied', 'unauthenticated', 'unimplemented'].includes(String(failure.code))
  )
}

/**
 * Executes Pulse-owned room recovery under the one-active-Gatekeeper contract.
 * 1. Positively read authority; changes and recovery messages are only hints.
 * 2. Journal dispatch before Cloud removal and persist the exact confirmed cutoff before reporting it.
 * 3. Read exact ready authority and revalidate around presence, access and token signing.
 * Unfinished journal rows block admission across process/epoch changes. Uncertain destructive calls
 * require controlled operator reconciliation; broker flush is never an application acknowledgement.
 * @param components - Pulse transport, access, LiveKit, wallet queue and durable dispatch journal.
 * @returns A lifecycle component; missing recovery authority always defers work.
 */
export async function createClusterSubscriberComponent(
  components: Pick<
    AppComponents,
    | 'config'
    | 'logs'
    | 'metrics'
    | 'nats'
    | 'livekit'
    | 'accessGate'
    | 'peerState'
    | 'clusterWalletQueue'
    | 'roomCleanupJournal'
  >
): Promise<IClusterSubscriberComponent> {
  const { config, logs, metrics, nats, livekit, accessGate, peerState, clusterWalletQueue, roomCleanupJournal } =
    components
  const logger = logs.getLogger('cluster-subscriber')
  const [
    enabledFlag,
    queueSetting,
    retrySetting,
    ttlSetting,
    concurrencySetting,
    backlogSetting,
    connectSetting,
    marginSetting,
    skewSetting
  ] = await Promise.all([
    config.getString('CLUSTER_SUBSCRIBER_ENABLED'),
    config.getString('NATS_QUEUE_GROUP'),
    config.getNumber('CLUSTER_TAKEOVER_RETRY_DELAY_MS'),
    config.getNumber('CLUSTER_ISLAND_TOKEN_TTL_SECONDS'),
    config.getNumber('CLUSTER_SNAPSHOT_CONCURRENCY'),
    config.getNumber('CLUSTER_SNAPSHOT_BACKLOG'),
    config.getNumber('CLUSTER_CONNECT_CONCURRENCY'),
    config.getNumber('CLUSTER_CLEANUP_CUTOFF_MARGIN_SECONDS'),
    config.getNumber('CLUSTER_CLEANUP_CLOCK_SKEW_ALLOWANCE_MS')
  ])
  const enabled = enabledFlag === 'true'
  const queueGroup = queueSetting || 'comms-gatekeeper-cluster'
  const retryDelayMs = Math.max(0, retrySetting ?? 100)
  const ttlSeconds = positiveNumberOr(ttlSetting, 60)
  const snapshotConcurrency = positiveIntegerOr(concurrencySetting, 16)
  const snapshotBacklog = positiveIntegerOr(backlogSetting, 10_000)
  const connectConcurrency = positiveIntegerOr(connectSetting, 64)
  const configuredMarginSeconds = Math.min(30, positiveIntegerOr(marginSetting, 5))
  const clockSkewAllowanceMs =
    Number.isInteger(skewSetting) && skewSetting >= 0 && skewSetting <= 5000 ? skewSetting : 1000
  const cutoffMarginSeconds = Math.max(configuredMarginSeconds, Math.ceil(clockSkewAllowanceMs / 1000) + 1)
  // Positive Cloud results known only to this process. They authorize nothing until persisted.
  const unpersistedSuccesses = new Map<string, { dispatch: CleanupDispatch; revokeBefore: number }>()
  const boundaryWait = new AbortController()
  setMaxListeners(0, boundaryWait.signal)

  function validPlan(entry: PeerClusterChange, session: string): boolean {
    const plan = entry.roomRecovery
    if (
      !plan ||
      entry.session !== session ||
      !SESSION_KEY.test(entry.session) ||
      !safeLabel(plan.epoch) ||
      !/^[1-9][0-9]{0,127}$/.test(plan.revision) ||
      ![RoomAdmissionState.PENDING, RoomAdmissionState.READY].includes(plan.admission) ||
      !safeSeconds(plan.tokenNotBefore) ||
      (!plan.cleanupOnly && !safeLabel(entry.clusterId)) ||
      (plan.cleanupOnly && !!entry.clusterId) ||
      plan.operations.length > 256 ||
      (plan.admission === RoomAdmissionState.READY && plan.operations.length > 0)
    )
      return false
    const ids = new Set<string>()
    const rooms = new Set<string>()
    for (const op of plan.operations) {
      if (
        !safeLabel(op.operationId) ||
        !safeLabel(op.clusterId) ||
        !safeSeconds(op.minimumRevokeBefore) ||
        ids.has(op.operationId) ||
        rooms.has(op.clusterId)
      )
        return false
      ids.add(op.operationId)
      rooms.add(op.clusterId)
    }
    return plan.admission !== RoomAdmissionState.PENDING || plan.operations.length > 0 || plan.bootstrapRequired
  }

  async function resolveAssignment(wallet: string, session: string): Promise<PeerClusterChange | undefined> {
    if (stopped || !SESSION_KEY.test(session)) return undefined
    const startedAt = Date.now()
    const reply = await nats.request(`peer.${wallet}.cluster_assignment`, Buffer.from(session))
    metrics.observe(
      'dcl_gatekeeper_cluster_authority_request_duration_seconds',
      { status: reply.status },
      (Date.now() - startedAt) / 1000
    )
    if (stopped) return undefined
    if (reply.status !== 'replied' || reply.data.length === 0) {
      metrics.increment('dcl_gatekeeper_cluster_authority_unavailable_total')
      return undefined
    }
    try {
      const entry = normalizeChange(PeerClusterChange.decode(reply.data))
      if (!validPlan(entry, session)) {
        metrics.increment('dcl_gatekeeper_cluster_authority_unavailable_total')
        return undefined
      }
      return entry
    } catch {
      metrics.increment('dcl_gatekeeper_cluster_authority_unavailable_total')
      return undefined
    }
  }

  function samePlan(left: PeerClusterChange, right: PeerClusterChange): boolean {
    return (
      left.roomRecovery.epoch === right.roomRecovery.epoch &&
      left.roomRecovery.revision === right.roomRecovery.revision &&
      left.session === right.session &&
      left.clusterId === right.clusterId &&
      left.realm === right.realm &&
      left.roomRecovery.cleanupOnly === right.roomRecovery.cleanupOnly
    )
  }
  async function currentPlan(wallet: string, entry: PeerClusterChange): Promise<PeerClusterChange | undefined> {
    const current = await resolveAssignment(wallet, entry.session)
    return current && samePlan(entry, current) ? current : undefined
  }
  function ready(entry: PeerClusterChange): boolean {
    return (
      entry.roomRecovery.admission === RoomAdmissionState.READY &&
      !entry.roomRecovery.bootstrapRequired &&
      !entry.roomRecovery.cleanupOnly
    )
  }
  async function persistKnownSuccesses(wallet: string): Promise<void> {
    for (const [key, receipt] of unpersistedSuccesses) {
      if (receipt.dispatch.wallet !== wallet) continue
      await roomCleanupJournal.confirm(receipt.dispatch, receipt.revokeBefore)
      unpersistedSuccesses.delete(key)
    }
  }
  async function reportCompletion(wallet: string, entry: PeerClusterChange, receipt: CleanupDispatch): Promise<void> {
    if (stopped) return
    const current = await currentPlan(wallet, entry)
    if (!current || current.roomRecovery.bootstrapRequired) return
    const pending = current.roomRecovery.operations.find((op) => op.operationId === receipt.operationId)
    if (
      !pending ||
      pending.clusterId !== receipt.clusterId ||
      receipt.revokeBefore < pending.minimumRevokeBefore ||
      receipt.epoch !== current.roomRecovery.epoch
    )
      return
    await nats.publishConfirmed(
      `peer.${wallet}.room_cleanup_completed`,
      RoomCleanupCompleted.encode({
        epoch: receipt.epoch,
        revision: current.roomRecovery.revision,
        operationId: receipt.operationId,
        clusterId: receipt.clusterId,
        revokeBefore: receipt.revokeBefore,
        observedReady: false
      }).finish()
    )
  }

  async function cleanOperation(wallet: string, entry: PeerClusterChange, op: RoomCleanupOperation): Promise<boolean> {
    const plan = entry.roomRecovery
    const stored = await roomCleanupJournal.get(wallet, plan.epoch, op.operationId)
    if (stopped) return false
    if (stored) {
      if (
        stored.state !== 'confirmed' ||
        stored.clusterId !== op.clusterId ||
        stored.revokeBefore < op.minimumRevokeBefore
      )
        return false
      await reportCompletion(wallet, entry, stored)
      return true
    }
    for (let attempt = 1; attempt <= TAKEOVER_ATTEMPTS; attempt++) {
      const current = await currentPlan(wallet, entry)
      const pending = current?.roomRecovery.operations.find((item) => item.operationId === op.operationId)
      if (
        !current ||
        current.roomRecovery.bootstrapRequired ||
        !pending ||
        pending.clusterId !== op.clusterId ||
        pending.minimumRevokeBefore !== op.minimumRevokeBefore ||
        (await roomCleanupJournal.hasUnfinished(wallet)) ||
        stopped
      )
        return false
      const cutoff = Math.max(Math.floor(Date.now() / 1000) + cutoffMarginSeconds, op.minimumRevokeBefore)
      if (cutoff * 1000 + clockSkewAllowanceMs - Date.now() >= 60_000) return false
      const receipt: CleanupDispatch = {
        wallet,
        epoch: plan.epoch,
        operationId: op.operationId,
        clusterId: op.clusterId,
        revokeBefore: cutoff
      }
      if (!(await roomCleanupJournal.dispatch(receipt))) {
        metrics.increment('dcl_gatekeeper_cluster_cleanup_capacity_total')
        return false
      }
      // No-call cancellation is safe only before Cloud handoff. A crash here leaves an honest unknown row.
      const dispatchAuthority = await currentPlan(wallet, entry)
      const dispatchOperation = dispatchAuthority?.roomRecovery.operations.find(
        (item) => item.operationId === op.operationId
      )
      if (
        !dispatchAuthority ||
        dispatchAuthority.roomRecovery.bootstrapRequired ||
        stopped ||
        !dispatchOperation ||
        dispatchOperation.clusterId !== op.clusterId ||
        dispatchOperation.minimumRevokeBefore !== op.minimumRevokeBefore
      ) {
        await roomCleanupJournal.cancelDefiniteFailure(receipt)
        return false
      }
      // Recompute AFTER the final authority/database await. The journal records a floor;
      // a crash remains blocked regardless of the precise cutoff eventually sent to Cloud.
      const effectiveCutoff = Math.max(
        Math.floor(Date.now() / 1000) + cutoffMarginSeconds,
        cutoff,
        op.minimumRevokeBefore
      )
      if (effectiveCutoff * 1000 + clockSkewAllowanceMs - Date.now() >= 60_000) {
        await roomCleanupJournal.cancelDefiniteFailure(receipt)
        return false
      }
      try {
        await livekit.removeParticipant(
          livekit.getIslandRoomName(op.clusterId),
          wallet,
          new Date(effectiveCutoff * 1000)
        )
      } catch (error) {
        metrics.increment('dcl_gatekeeper_cluster_takeover_failed_total')
        if (!isDefiniteRejection(error)) {
          metrics.increment('dcl_gatekeeper_cluster_cleanup_unfinished_total')
          logger.error('Room removal outcome is unknown; durable admission block retained', {
            wallet,
            operationId: op.operationId,
            error: getErrorMessage(error)
          })
          return false
        }
        await roomCleanupJournal.cancelDefiniteFailure(receipt)
        if (stopped || attempt === TAKEOVER_ATTEMPTS) return false
        if (retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt))
        continue
      }
      if (Date.now() + clockSkewAllowanceMs >= effectiveCutoff * 1000) {
        // Success after the boundary does not prove refreshed tokens were covered at execution.
        // Keep the dispatch unresolved rather than issue a winner token across an uncertain cutoff.
        metrics.increment('dcl_gatekeeper_cluster_cleanup_unfinished_total')
        logger.error('Removal confirmation arrived after its revocation cutoff; reconciliation required', {
          wallet,
          operationId: op.operationId
        })
        return false
      }
      // Capture confirmed success before any await. DB loss blocks admission; only this process may retry persistence.
      const key = JSON.stringify([wallet, plan.epoch, op.operationId])
      unpersistedSuccesses.set(key, { dispatch: receipt, revokeBefore: effectiveCutoff })
      await roomCleanupJournal.confirm(receipt, effectiveCutoff)
      unpersistedSuccesses.delete(key)
      metrics.increment('dcl_gatekeeper_cluster_takeover_evicted_total')
      if (stopped) return false
      await reportCompletion(wallet, entry, { ...receipt, revokeBefore: effectiveCutoff })
      return true
    }
    return false
  }

  async function processPeerConnect(wallet: string, session: string): Promise<void> {
    let entry = await resolveAssignment(wallet, session)
    if (!entry || stopped) return
    await persistKnownSuccesses(wallet)
    if (stopped || (await roomCleanupJournal.hasUnfinished(wallet))) {
      metrics.increment('dcl_gatekeeper_cluster_cleanup_unfinished_total')
      return
    }
    if (entry.roomRecovery.bootstrapRequired) return
    await roomCleanupJournal.pruneConfirmed(
      wallet,
      entry.roomRecovery.epoch,
      entry.roomRecovery.operations.map((op) => op.operationId)
    )
    if (stopped) return
    if (entry.roomRecovery.admission === RoomAdmissionState.PENDING) {
      for (const op of entry.roomRecovery.operations) if (!(await cleanOperation(wallet, entry, op))) return
      // A flush says nothing about Pulse recording readiness.
      entry = await currentPlan(wallet, entry)
      if (!entry) return
    }
    if (
      entry.roomRecovery.cleanupOnly &&
      entry.roomRecovery.admission === RoomAdmissionState.READY &&
      !entry.roomRecovery.bootstrapRequired
    ) {
      // Pulse retains a completed departure until this process observes readiness AND prunes
      // confirmed receipts. A lost observation is retried through the retained tombstone hints.
      await roomCleanupJournal.pruneConfirmed(wallet, entry.roomRecovery.epoch, [])
      const retired = await currentPlan(wallet, entry)
      if (
        !retired ||
        retired.roomRecovery.admission !== RoomAdmissionState.READY ||
        !retired.roomRecovery.cleanupOnly ||
        retired.roomRecovery.bootstrapRequired ||
        (await roomCleanupJournal.hasUnfinished(wallet)) ||
        stopped
      )
        return
      await nats.publishConfirmed(
        `peer.${wallet}.room_cleanup_completed`,
        RoomCleanupCompleted.encode({
          epoch: retired.roomRecovery.epoch,
          revision: retired.roomRecovery.revision,
          operationId: '',
          clusterId: '',
          revokeBefore: 0,
          observedReady: true
        }).finish()
      )
      return
    }
    if (!ready(entry) || stopped || (await roomCleanupJournal.hasUnfinished(wallet)) || stopped) return
    const boundary = entry.roomRecovery.tokenNotBefore * 1000 + clockSkewAllowanceMs
    if (boundary - Date.now() >= 60_000) return
    if (boundary > Date.now()) {
      await waitUntil(boundary, boundaryWait.signal)
      if (stopped) return
      const afterWait = await currentPlan(wallet, entry)
      if (
        !afterWait ||
        !ready(afterWait) ||
        afterWait.roomRecovery.tokenNotBefore * 1000 + clockSkewAllowanceMs > Date.now() ||
        stopped ||
        (await roomCleanupJournal.hasUnfinished(wallet)) ||
        stopped
      )
        return
      entry = afterWait
    }
    const room = livekit.getIslandRoomName(entry.clusterId)
    try {
      if (await livekit.holdsParticipant(room, wallet)) {
        metrics.increment('dcl_gatekeeper_cluster_reannounce_suppressed_total')
        return
      }
    } catch (error) {
      metrics.increment('dcl_gatekeeper_cluster_reannounce_check_failed_total')
      logger.warn('Cannot verify island membership; admission deferred', { wallet, error: getErrorMessage(error) })
      return
    }
    if (stopped) return
    try {
      const access = await accessGate.getAccessState({ address: wallet })
      if (access.isBanned || access.isDenylisted) {
        metrics.increment('dcl_gatekeeper_cluster_banned_skipped_total')
        return
      }
    } catch (error) {
      metrics.increment('dcl_gatekeeper_cluster_access_check_failed_total')
      logger.warn('Cannot verify island access; admission deferred', { wallet, error: getErrorMessage(error) })
      return
    }
    const beforeMint = await currentPlan(wallet, entry)
    if (!beforeMint || !ready(beforeMint) || stopped || (await roomCleanupJournal.hasUnfinished(wallet)) || stopped)
      return
    const nbf = Math.max(Math.floor((Date.now() - clockSkewAllowanceMs) / 1000), beforeMint.roomRecovery.tokenNotBefore)
    // A higher floor arriving while checking access is retried on a later hint.
    if (nbf * 1000 + clockSkewAllowanceMs > Date.now()) return
    const credentials = await livekit.generateCredentials(wallet, room, { cast: [] }, false, undefined, {
      notBefore: new Date(nbf * 1000),
      ttlSeconds
    })
    metrics.increment('dcl_gatekeeper_cluster_tokens_minted_total')
    const afterMint = await currentPlan(wallet, beforeMint)
    if (
      !afterMint ||
      !ready(afterMint) ||
      afterMint.roomRecovery.tokenNotBefore !== beforeMint.roomRecovery.tokenNotBefore ||
      nbf * 1000 + clockSkewAllowanceMs > Date.now() ||
      stopped ||
      (await roomCleanupJournal.hasUnfinished(wallet))
    )
      return
    const previous = peerState.get(wallet)
    const message: IslandChangedMessage = {
      islandId: room,
      connStr: livekit.buildConnectionUrl(credentials.url, credentials.token),
      peers: {},
      ...(previous ? { fromIslandId: previous.room } : {})
    }
    if (stopped) return
    const outcome = await nats.publishConfirmed(
      `engine.peer.${wallet}.island_changed.${entry.session}`,
      IslandChangedMessage.encode(message).finish()
    )
    if (stopped) return
    if (outcome === 'dropped') {
      metrics.increment('dcl_gatekeeper_cluster_publish_failed_total')
      return
    }
    metrics.increment('dcl_gatekeeper_cluster_published_total')
    peerState.set(wallet, { clusterId: entry.clusterId, room, session: entry.session, lastSeen: Date.now() })
  }
  async function processAuthoritativeChange(wallet: string, change: PeerClusterChange): Promise<void> {
    await processPeerConnect(wallet, change.session)
  }

  /**
   * Wraps a subscription callback so nothing escapes it and the wallet is parsed once.
   *
   * nats.js invokes these from its own reader loop, so a throw that escapes one of them stops
   * delivery on every subject on the connection, not just this one.
   *
   * @param what - Short name of the message kind, used in the error log.
   * @param handle - Receives the lower-cased wallet from the subject.
   * @returns A callback safe to hand to `nats.subscribe`.
   */
  function guarded(what: string, handle: (wallet: string, data: Uint8Array) => void): NatsMessageHandler {
    return (subject, data) => {
      try {
        // Wallet is the token after `peer.`.
        const wallet = subject.split('.')[1]?.toLowerCase()
        if (stopped || !wallet || !SESSION_KEY.test(wallet)) {
          logger.warn(`Cannot extract a wallet from subject ${subject}`)
          return
        }

        handle(wallet, data)
      } catch (error) {
        logger.error(`Cannot process ${what} message on ${subject}: ${getErrorMessage(error)}`)
      }
    }
  }

  // Lower-cases the session once at decode time, so every consumer of a decoded change - minting,
  // recovery and the session-addressed subject choice - agrees on its casing.
  function normalizeChange(change: PeerClusterChange): PeerClusterChange {
    return { ...change, session: change.session.toLowerCase() }
  }

  function handleClusterChange(wallet: string, data: Uint8Array): void {
    const change = normalizeChange(PeerClusterChange.decode(data))
    metrics.increment('dcl_gatekeeper_cluster_events_received_total')

    // After the received-counter: this is a payload problem, not a decode one. Protobuf
    // decodes a missing cluster_id as '', and unguarded that would dump every such peer into
    // one shared `island-` room.
    if (!change.clusterId && !change.roomRecovery?.cleanupOnly) {
      logger.warn(`Cannot process cluster_change for ${wallet}: empty clusterId`)
      return
    }

    // Serialized per wallet: an out-of-order mint would publish a stale room and corrupt the
    // next fromIslandId, and two concurrent misses on the gate's cache would both pay the round
    // trip. LOCAL TO THIS PROCESS ONLY: the queue, peer state and their ordering guarantees do
    // not span replicas, and the queue group has no per-wallet affinity. This service runs as a
    // single replica; before scaling it out, two events for one wallet could land on different
    // replicas and publish out of order, so that step needs a per-wallet sequence from Pulse
    // or wallet-affine routing first.
    void clusterWalletQueue
      .enqueue(wallet, () => processAuthoritativeChange(wallet, change))
      .catch((error) => {
        logger.error(`Cannot process cluster_change for ${wallet}: ${getErrorMessage(error)}`)
      })
  }

  // Bounds how many connects are being resolved at once. A WS Connector deploy reconnects every
  // peer within seconds, and each connect costs a Pulse round trip and a LiveKit lookup; without
  // a bound that herd lands on both at once. A connect over the bound waits for a slot rather than
  // being dropped, keeps its place in its wallet's queue, and passes its slot straight to the next
  // waiter when it finishes, so the count never overshoots.
  let activeConnects = 0
  const waitingConnects: (() => void)[] = []

  async function withConnectSlot(task: () => Promise<void>): Promise<void> {
    if (activeConnects >= connectConcurrency) {
      await new Promise<void>((resolve) => waitingConnects.push(resolve))
    } else {
      activeConnects++
    }
    try {
      await task()
    } finally {
      const next = waitingConnects.shift()
      if (next) next()
      else activeConnects--
    }
  }

  function handlePeerConnect(wallet: string, data: Uint8Array): void {
    metrics.increment('dcl_gatekeeper_cluster_connects_received_total')
    const session = Buffer.from(data).toString('utf8').toLowerCase()

    // Same queue as cluster changes, so within one process a reconnect cannot interleave with
    // a move for the same wallet.
    void clusterWalletQueue
      .enqueue(wallet, () => withConnectSlot(() => (stopped ? Promise.resolve() : processPeerConnect(wallet, session))))
      .catch((error) => {
        logger.error(`Cannot process connect for ${wallet}: ${getErrorMessage(error)}`)
      })
  }

  // Recovery is lower-priority background work. FIFO admission across wallets prevents one
  // noisy wallet from jumping ahead of others. A queued wallet keeps only its latest session;
  // hints for an in-flight wallet are retried by Pulse's next snapshot, never accumulated.
  // A slot is taken when the job is queued, not when it starts, so a hint for a wallet with a
  // move or connect still in flight holds its slot while it waits behind them - one wallet's
  // queue is short, so the wait is too, and it keeps the bound honest about work admitted.
  const pendingSnapshots = new Map<string, string>()
  const activeSnapshots = new Set<string>()
  let stopped = false

  function drainSnapshots(): void {
    while (!stopped && activeSnapshots.size < snapshotConcurrency && pendingSnapshots.size > 0) {
      const next = pendingSnapshots.entries().next().value
      if (!next) return
      const [wallet, session] = next
      pendingSnapshots.delete(wallet)
      activeSnapshots.add(wallet)
      // Fire-and-forget: each job releases its slot on success or failure; stop clears pending
      // work and the existing wallet queue lifecycle drains jobs already in flight.
      void clusterWalletQueue
        .enqueue(wallet, async () => {
          if (!stopped) await processPeerConnect(wallet, session)
        })
        .catch((error) => {
          logger.warn('Cannot reconcile cluster snapshot', { wallet, error: getErrorMessage(error) })
        })
        .finally(() => {
          activeSnapshots.delete(wallet)
          drainSnapshots()
        })
    }
  }

  function handleSnapshot(wallet: string, data: Uint8Array): void {
    const change = normalizeChange(PeerClusterChange.decode(data))
    if (stopped || !SESSION_KEY.test(change.session) || activeSnapshots.has(wallet)) return
    if (!pendingSnapshots.has(wallet) && pendingSnapshots.size >= snapshotBacklog) {
      metrics.increment('dcl_gatekeeper_cluster_snapshot_overflow_total')
      return
    }
    pendingSnapshots.set(wallet, change.session)
    drainSnapshots()
  }

  const subscriptions: NatsSubscription[] = []

  async function start(): Promise<void> {
    if (!enabled) {
      logger.info('Cluster subscriber is disabled (CLUSTER_SUBSCRIBER_ENABLED is not "true")')
      return
    }
    if (!nats.isEnabled()) {
      logger.info('Cluster subscriber is enabled but NATS is not configured, staying idle')
      return
    }

    // Queue-grouped: without it, N replicas would each mint and publish for every event,
    // giving each client N island_changed messages with N different tokens.
    subscriptions.push(
      nats.subscribe('peer.*.cluster_change', guarded('cluster_change', handleClusterChange), { queue: queueGroup })
    )

    subscriptions.push(nats.subscribe('peer.*.connect', guarded('connect', handlePeerConnect), { queue: queueGroup }))
    subscriptions.push(
      nats.subscribe('peer.*.cluster_snapshot', guarded('cluster_snapshot', handleSnapshot), { queue: queueGroup })
    )

    // Not awaited - well-known-components gates HTTP readiness (/health/ready, /health/startup)
    // on start() resolving, and connect() can stall ~20s per unreachable broker address before
    // giving up. It never throws and retries in the background regardless, so awaiting here
    // would only cost readiness time (src/adapters/nats/component.ts).
    void nats.connect()

    logger.info(`Cluster subscriber started (queue group: ${queueGroup})`)
  }

  async function stop(): Promise<void> {
    stopped = true
    boundaryWait.abort()
    pendingSnapshots.clear()
    if (subscriptions.length === 0) {
      return
    }

    for (const subscription of subscriptions.splice(0)) {
      subscription.unsubscribe()
    }
    logger.info('Cluster subscriber stopped taking events')
  }

  return { [START_COMPONENT]: start, [STOP_COMPONENT]: stop }
}
