import { IslandChangedMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import { PeerClusterChange } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { NatsMessageHandler, NatsSubscription } from '../../adapters/nats'
import { getErrorMessage } from '../errors'
import { AppComponents } from '../../types'
import { positiveNumberOr } from '../../utils/config'
import { IClusterSubscriberComponent } from './types'

function positiveIntegerOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback
}

const DEFAULT_QUEUE_GROUP = 'comms-gatekeeper-cluster'
const DEFAULT_TAKEOVER_RETRY_DELAY_MS = 100
const DEFAULT_SNAPSHOT_CONCURRENCY = 16
const DEFAULT_SNAPSHOT_BACKLOG = 10_000
// Short on purpose: the client uses the string within a second of receiving it, and a displaced
// token the eviction could not reach (participant absent) stays usable only this long.
const DEFAULT_ISLAND_TOKEN_TTL_SECONDS = 60
const TAKEOVER_ATTEMPTS = 3
const SESSION_KEY = /^0x[0-9a-f]{40}$/

/** The start of the second after the current one, as a revocation boundary. */
function nextWholeSecond(): Date {
  return new Date((Math.floor(Date.now() / 1000) + 1) * 1000)
}

/**
 * Creates the subscriber that translates Pulse's cluster feed into LiveKit connection strings
 * (see docs/ai-agent-context.md).
 *
 * Per inbound `peer.*.cluster_change`:
 * 1. Extract the wallet from the subject and decode the payload, discarding anything malformed.
 * 2. Serialize per wallet and resolve current Pulse authority; stale edge payloads cannot roll
 * the room back. Check membership, then run the platform-access gate before minting.
 * 2b. When the event names a displaced session, remove that participant from the cluster it was
 * last published into, revoking its tokens, before minting.
 * 3. Mint a LiveKit token for the cluster's island room.
 * 4. Publish `engine.peer.{wallet}.island_changed.{session}` when the event names a valid session,
 * or the legacy `engine.peer.{wallet}.island_changed` when it does not (an older Pulse) — carrying
 * the previous room as `fromIslandId`.
 * 5. Record the new assignment in peer state.
 *
 * On connect and periodic Pulse snapshot hints, request the authoritative assignment from
 * Pulse, validate the connecting session, and mint only if LiveKit reports the wallet absent.
 * This repairs lost change events and local restarts without disturbing healthy rooms.
 * A failed lookup or publish is retried by the next snapshot, not by an unbounded local timer.
 *
 * Off unless `CLUSTER_SUBSCRIBER_ENABLED` is `'true'` and NATS is configured; when off it
 * subscribes to nothing and is byte-identical to not having the component at all.
 *
 * On stop it unsubscribes from every subject and ignores pending snapshot jobs. Components stop in reverse creation order,
 * so this runs first, then the wallet queue drains whatever is mid-flight, and only then does
 * the NATS adapter close its connection. An event arriving after the unsubscribe goes to
 * another member of the queue group instead of being minted against a closing connection.
 *
 * WS Connector must already subscribe to the session-addressed, five-token subject before this
 * runs, since a session-named event is published there unconditionally.
 *
 * @param components - Config, logs, metrics, NATS, LiveKit, access gate, peer state and the
 * per-wallet queue. Current assignments are resolved from Pulse, never a local mirror.
 * @returns The cluster subscriber component. It only exposes a lifecycle hook; everything else
 * it does is driven by the feed.
 */
export async function createClusterSubscriberComponent(
  components: Pick<
    AppComponents,
    'config' | 'logs' | 'metrics' | 'nats' | 'livekit' | 'accessGate' | 'peerState' | 'clusterWalletQueue'
  >
): Promise<IClusterSubscriberComponent> {
  const { config, logs, metrics, nats, livekit, accessGate, peerState, clusterWalletQueue } = components
  const logger = logs.getLogger('cluster-subscriber')

  const [
    enabledFlag,
    queueGroupSetting,
    retryDelaySetting,
    islandTokenTtlSetting,
    snapshotConcurrencySetting,
    snapshotBacklogSetting
  ] = await Promise.all([
    config.getString('CLUSTER_SUBSCRIBER_ENABLED'),
    config.getString('NATS_QUEUE_GROUP'),
    config.getNumber('CLUSTER_TAKEOVER_RETRY_DELAY_MS'),
    config.getNumber('CLUSTER_ISLAND_TOKEN_TTL_SECONDS'),
    config.getNumber('CLUSTER_SNAPSHOT_CONCURRENCY'),
    config.getNumber('CLUSTER_SNAPSHOT_BACKLOG')
  ])
  const islandTokenTtlSeconds = positiveNumberOr(islandTokenTtlSetting, DEFAULT_ISLAND_TOKEN_TTL_SECONDS)

  const snapshotConcurrency = positiveIntegerOr(snapshotConcurrencySetting, DEFAULT_SNAPSHOT_CONCURRENCY)
  const snapshotBacklog = positiveIntegerOr(snapshotBacklogSetting, DEFAULT_SNAPSHOT_BACKLOG)

  const enabled = enabledFlag === 'true'
  const queueGroup = queueGroupSetting || DEFAULT_QUEUE_GROUP
  // `??` on purpose: a configured 0 is a real value here (no sleep before retrying).
  const takeoverRetryDelayMs = retryDelaySetting ?? DEFAULT_TAKEOVER_RETRY_DELAY_MS

  // The one place in this service that fails open on the whole gate, deny list included: a
  // background feed has no caller to return an error to, and failing closed would stop island
  // formation for everyone during an outage of either store. Bounded by ban-time room eviction
  // and by every event re-querying, so the next one retries. Rationale in docs/ai-agent-context.md.
  async function isDeniedAccess(wallet: string): Promise<boolean> {
    try {
      const { isBanned, isDenylisted } = await accessGate.getAccessState({ address: wallet })
      return isBanned || isDenylisted
    } catch (error) {
      metrics.increment('dcl_gatekeeper_cluster_access_check_failed_total')
      logger.warn(`Access check failed for ${wallet}, allowing: ${getErrorMessage(error)}`)
      return false
    }
  }

  async function processClusterChange(wallet: string, change: PeerClusterChange): Promise<void> {
    if (await isDeniedAccess(wallet)) {
      metrics.increment('dcl_gatekeeper_cluster_banned_skipped_total')
      logger.info(`Skipping banned wallet ${wallet} assigned to cluster ${change.clusterId}`)
      return
    }

    // A takeover revokes the displaced session's tokens and mints the replacement across one
    // boundary. LiveKit revokes tokens whose nbf is before the stamp, at second granularity, and
    // the SDK stamps nbf with the mint second, so a stamp of "now" would spare a displaced token
    // minted in this same second. The boundary is therefore the NEXT whole second: every token
    // minted so far is before it, and the replacement is minted with its nbf set to it. LiveKit
    // validates nbf with a minute of leeway, so the client can use that token at once, no waiting.
    const revocationBoundary = change.displacedSession ? nextWholeSecond() : undefined
    if (revocationBoundary) {
      await evictDisplacedSession(wallet, change, revocationBoundary)
    }

    const room = livekit.getIslandRoomName(change.clusterId)

    // Ordinary recovery reaches here only after confirmed absence; explicit takeovers must
    // mint regardless because they have just attempted to remove the displaced participant.
    const credentials = await livekit.generateCredentials(wallet, room, { cast: [] }, false, undefined, {
      ...(revocationBoundary ? { notBefore: revocationBoundary } : {}),
      ttlSeconds: islandTokenTtlSeconds
    })
    metrics.increment('dcl_gatekeeper_cluster_tokens_minted_total')

    const previous = peerState.get(wallet)
    const message: IslandChangedMessage = {
      islandId: room,
      connStr: livekit.buildConnectionUrl(credentials.url, credentials.token),
      // Empty by design: unity-explorer reads only connStr (see docs/ai-agent-context.md).
      peers: {}
    }
    if (previous) {
      // Omitted rather than set to '' when absent, matching what core put on the wire.
      message.fromIslandId = previous.room
    }

    // Addressed to the session whenever the event names a valid one: an older Pulse sends no
    // session, and a malformed one must never become subject tokens, so both fall back to the
    // legacy four-token subject.
    const subject = SESSION_KEY.test(change.session)
      ? `engine.peer.${wallet}.island_changed.${change.session}`
      : `engine.peer.${wallet}.island_changed`

    let delivered: boolean
    try {
      // Never hoist a shared encoder across the mint's await above - that would corrupt frames.
      delivered = await nats.publishConfirmed(subject, IslandChangedMessage.encode(message).finish())
    } catch (error) {
      metrics.increment('dcl_gatekeeper_cluster_publish_failed_total')
      logger.error(`Failed to publish island_changed for ${wallet}: ${getErrorMessage(error)}`)
      return
    }

    // A dropped publish does not throw: the connection can go away during the mint above, and
    // the adapter then discards the write. Counting that as published would make the metrics
    // lie exactly when the feed is broken, and storing the assignment would point the next
    // fromIslandId at a room this peer was never told to join.
    if (!delivered) {
      metrics.increment('dcl_gatekeeper_cluster_publish_failed_total')
      logger.error(`Dropped island_changed for ${wallet}: no NATS connection to publish on`)
      return
    }

    metrics.increment('dcl_gatekeeper_cluster_published_total')
    peerState.set(wallet, { clusterId: change.clusterId, room, lastSeen: Date.now() })
  }

  // Removes the displaced session's participant from the room it was last published into and
  // revokes every token minted for the wallet before `revokeBefore`. Retried: this runs on a
  // background feed with nobody to report to, and a transient LiveKit error would otherwise
  // leave two sessions in comms until one of them leaves.
  async function evictDisplacedSession(wallet: string, change: PeerClusterChange, revokeBefore: Date): Promise<void> {
    if (!change.displacedClusterId) {
      metrics.increment('dcl_gatekeeper_cluster_takeover_failed_total')
      logger.warn(`Cannot evict displaced session ${change.displacedSession} of ${wallet}: no displaced cluster named`)
      return
    }

    const room = livekit.getIslandRoomName(change.displacedClusterId)
    for (let attempt = 1; attempt <= TAKEOVER_ATTEMPTS; attempt++) {
      try {
        await livekit.removeParticipant(room, wallet, revokeBefore)
        metrics.increment('dcl_gatekeeper_cluster_takeover_evicted_total')
        return
      } catch (error) {
        if ((error as { code?: string })?.code === 'not_found') {
          // The participant had already left, so there is nothing to remove and LiveKit
          // records no revocation for it.
          metrics.increment('dcl_gatekeeper_cluster_takeover_absent_total')
          logger.debug(
            `Displaced session ${change.displacedSession} of ${wallet} was no longer in ${room}; nothing to remove`
          )
          return
        }
        if (attempt === TAKEOVER_ATTEMPTS) {
          metrics.increment('dcl_gatekeeper_cluster_takeover_failed_total')
          logger.warn(
            `Cannot evict displaced session ${change.displacedSession} of ${wallet} from ${room}: ${getErrorMessage(error)}`
          )
          return
        }
        // Skipped rather than scheduled at 0ms: a real timer, even a zero one, is a macrotask,
        // so `CLUSTER_TAKEOVER_RETRY_DELAY_MS=0` is a genuine no-sleep retry rather than one
        // that merely rounds down to the platform's minimum timer resolution.
        const delayMs = takeoverRetryDelayMs * attempt
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
      }
    }
  }

  // Reconcile a connect or periodic hint against Pulse, including unchanged assignments.
  async function resolveAssignment(wallet: string, session: string): Promise<PeerClusterChange | undefined> {
    // Query Pulse at execution time: queued edges and snapshot hints can both be historical.
    // Empty sessions are supported for legacy connectors, but malformed ones must fail closed.
    if (session && !SESSION_KEY.test(session)) return undefined
    const reply = await nats.request(`peer.${wallet}.cluster_assignment`, Buffer.from(session))
    if (!reply?.length) {
      metrics.increment('dcl_gatekeeper_cluster_reannounce_unresolved_total')
      return undefined
    }
    const entry = normalizeChange(PeerClusterChange.decode(reply))
    if (
      !entry.clusterId ||
      (entry.session && !SESSION_KEY.test(entry.session)) ||
      (session && entry.session !== session)
    ) {
      metrics.increment('dcl_gatekeeper_cluster_reannounce_skipped_other_session_total')
      return undefined
    }

    return entry
  }

  async function processPeerConnect(wallet: string, session: string): Promise<void> {
    const entry = await resolveAssignment(wallet, session)
    if (entry) await reconcileAssignment(wallet, entry)
  }

  // Edge payloads can be older than a snapshot lookup already processed by this wallet's
  // queue. Re-resolve every edge when it executes; only its explicit takeover cleanup survives.
  // A superseded session may neither mint credentials nor evict the current participant.
  async function processAuthoritativeChange(wallet: string, change: PeerClusterChange): Promise<void> {
    const current = await resolveAssignment(wallet, change.session)
    if (!current) return
    if (change.displacedSession) {
      await processClusterChange(wallet, {
        ...current,
        displacedSession: change.displacedSession,
        displacedClusterId: change.displacedClusterId
      })
    } else {
      await reconcileAssignment(wallet, current)
    }
  }

  async function reconcileAssignment(wallet: string, entry: PeerClusterChange): Promise<void> {
    let alreadyInRoom: boolean
    try {
      alreadyInRoom = await livekit.holdsParticipant(livekit.getIslandRoomName(entry.clusterId), wallet)
    } catch (error) {
      // FAILS CLOSED, unlike the ban gate above, and for the opposite reason. Only the
      // signalling socket has to have dropped for this event to fire, so the peer is often
      // still in its room; announcing it there again puts two participants under one identity
      // and LiveKit ends the live one. Reading "cannot tell" as "not in the room" would do
      // that to every reconnecting peer at once, which is exactly when this lookup is most
      // likely to fail - a ws-connector deploy reconnects everyone in seconds. Leaving a
      // stranded peer waiting costs it one snapshot interval; the other way costs it its session.
      metrics.increment('dcl_gatekeeper_cluster_reannounce_check_failed_total')
      logger.warn(
        `Cannot tell whether ${wallet} already holds its island, not re-announcing: ${getErrorMessage(error)}`
      )
      return
    }

    if (alreadyInRoom) {
      metrics.increment('dcl_gatekeeper_cluster_reannounce_suppressed_total')
      return
    }

    metrics.increment('dcl_gatekeeper_cluster_reannounce_attempted_total')
    // Address credentials only to the session validated by the authority. Legacy connects
    // carry no session, so use the active session returned by Pulse.
    await processClusterChange(wallet, {
      clusterId: entry.clusterId,
      realm: entry.realm,
      session: entry.session,
      displacedSession: '',
      displacedClusterId: ''
    })
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
        if (!wallet) {
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
    if (!change.clusterId) {
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

  function handlePeerConnect(wallet: string, data: Uint8Array): void {
    metrics.increment('dcl_gatekeeper_cluster_connects_received_total')
    const session = Buffer.from(data).toString('utf8').toLowerCase()

    // Same queue as cluster changes, so within one process a reconnect cannot interleave with
    // a move for the same wallet.
    void clusterWalletQueue
      .enqueue(wallet, () => processPeerConnect(wallet, session))
      .catch((error) => {
        logger.error(`Cannot process connect for ${wallet}: ${getErrorMessage(error)}`)
      })
  }

  // Recovery is lower-priority background work. FIFO admission across wallets prevents one
  // noisy wallet from jumping ahead of others. A queued wallet keeps only its latest session;
  // hints for an in-flight wallet are retried by Pulse's next snapshot, never accumulated.
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

    // Grouped so only one replica handles each connection request.
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
