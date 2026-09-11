import { IslandChangedMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import { PeerClusterChange } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { START_COMPONENT } from '@well-known-components/interfaces'
import { LRUCache } from 'lru-cache'
import { NatsMessageHandler } from '../../adapters/nats'
import { getErrorMessage } from '../errors'
import { AppComponents } from '../../types'
import { positiveNumberOr } from '../../utils/config'
import { IClusterSubscriberComponent } from './types'

const DEFAULT_BAN_CACHE_TTL_MS = 30_000
const BAN_CACHE_MAX = 20_000
const DEFAULT_QUEUE_GROUP = 'comms-gatekeeper-cluster'
const DEFAULT_TAKEOVER_RETRY_DELAY_MS = 100
const TAKEOVER_ATTEMPTS = 3
const SESSION_KEY = /^0x[0-9a-f]{40}$/

/**
 * Creates the subscriber that translates Pulse's cluster feed into LiveKit connection strings
 * (see docs/ai-agent-context.md).
 *
 * Per inbound `peer.*.cluster_change`:
 * 1. Extract the wallet from the subject and decode the payload, discarding anything malformed.
 * 2. Serialize per wallet, then run the platform-access gate, skipping banned or deny-listed peers.
 * 2b. When the event names a displaced session, remove that participant from the cluster it was
 * last published into, revoking its tokens, before minting.
 * 3. Mint a LiveKit token for the cluster's island room.
 * 4. Publish `engine.peer.{wallet}.island_changed.{session}` when the event names a valid session,
 * or the legacy `engine.peer.{wallet}.island_changed` when it does not (an older Pulse) — carrying
 * the previous room as `fromIslandId`.
 * 5. Record the new assignment in peer state.
 *
 * Per inbound `peer.*.connect` (a peer's comms session starting), the wallet's last known
 * island is re-announced through the same path, unless the connecting session differs from the
 * one last recorded for the wallet (that device was displaced) or LiveKit already lists the
 * wallet in that room. Pulse's feed only speaks when a peer's cluster changes, so without this
 * a client that reconnects standing still is never given a room.
 *
 * Off unless `CLUSTER_SUBSCRIBER_ENABLED` is `'true'` and NATS is configured; when off it
 * subscribes to nothing and is byte-identical to not having the component at all.
 *
 * WS Connector must already subscribe to the session-addressed, five-token subject before this
 * runs, since a session-named event is published there unconditionally.
 *
 * @param components - The config, logs, metrics, nats, livekit, access gate, player connection
 * database and peer state components.
 * @returns The cluster subscriber component. It only exposes a lifecycle hook; everything else
 * it does is driven by the feed.
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
    | 'playerConnectionDb'
    | 'peerState'
    | 'assignmentMirror'
  >
): Promise<IClusterSubscriberComponent> {
  const { config, logs, metrics, nats, livekit, accessGate, playerConnectionDb, peerState, assignmentMirror } =
    components
  const logger = logs.getLogger('cluster-subscriber')

  const [enabledFlag, queueGroupSetting, banCacheTtlSetting, retryDelaySetting] = await Promise.all([
    config.getString('CLUSTER_SUBSCRIBER_ENABLED'),
    config.getString('NATS_QUEUE_GROUP'),
    config.getNumber('CLUSTER_BAN_CACHE_TTL_MS'),
    config.getNumber('CLUSTER_TAKEOVER_RETRY_DELAY_MS')
  ])

  const enabled = enabledFlag === 'true'
  const queueGroup = queueGroupSetting || DEFAULT_QUEUE_GROUP
  // `??` on purpose: a configured 0 is a real value here (no sleep before retrying), unlike
  // the lru-cache bounds below.
  const takeoverRetryDelayMs = retryDelaySetting ?? DEFAULT_TAKEOVER_RETRY_DELAY_MS

  // First ban cache in this service - the path was two uncached DB reads per event. A stale
  // hit is fine because banning also removes the participant from every live room.
  const banCache = new LRUCache<string, boolean>({
    max: BAN_CACHE_MAX,
    // Guarded rather than `??`: a configured 0 would mean "never expires" to lru-cache, so a
    // ban added after a wallet was cached as allowed would not take effect for the process's
    // whole life.
    ttl: positiveNumberOr(banCacheTtlSetting, DEFAULT_BAN_CACHE_TTL_MS)
  })

  async function isBanned(wallet: string): Promise<boolean> {
    const cached = banCache.get(wallet)
    if (cached !== undefined) {
      return cached
    }

    let banned: boolean
    try {
      // Device id catches a banned player back on a fresh wallet, using what that wallet's
      // last HTTP request recorded. Read-only - never call upsertPlayerConnection here; the
      // HTTP path owns the real IP/device data and this would null it out.
      const connectionInfo = await playerConnectionDb.getByAddress(wallet)
      const accessState = await accessGate.getAccessState({
        address: wallet,
        deviceId: connectionInfo?.deviceId ?? null
      })
      banned = accessState.isBanned || accessState.isDenylisted
    } catch (error) {
      // FAILS OPEN ON PURPOSE, for every lookup in the block above - the connection-info read,
      // the platform ban store and the deny list alike. This is a deliberate product decision,
      // not an oversight, and it has been raised in review before: the alternative (fail closed)
      // means that an outage in any one of those three dependencies stops island formation and
      // players cannot get into voice at all. Availability of the platform is judged the more
      // important property here; a moderation gate that is briefly permissive is recoverable,
      // a world nobody can connect to is not.
      //
      // What this costs, stated plainly so it stays a known trade-off: while a lookup is
      // failing, a banned or deny-listed wallet can be minted an island token. Two things bound
      // it. Banning removes the participant from every live room at ban time, so this only
      // affects a *new* room the wallet joins during the outage. And the result is deliberately
      // not written to banCache, so the very next event retries the lookup instead of the
      // process staying wrong for the whole TTL.
      //
      // Note this differs from the signed-fetch HTTP path on purpose: there, only the ban
      // lookup fails open and a deny-list error still rejects the request. That path is a
      // synchronous user-initiated request that can surface an error to the client and be
      // retried; this one is a background feed with no caller to report to, where dropping the
      // event just leaves the peer silently without a room.
      logger.warn(`Ban check failed for ${wallet}, allowing: ${getErrorMessage(error)}`)
      return false
    }

    banCache.set(wallet, banned)
    return banned
  }

  async function processClusterChange(wallet: string, change: PeerClusterChange): Promise<void> {
    if (await isBanned(wallet)) {
      metrics.increment('dcl_gatekeeper_cluster_banned_skipped_total')
      logger.info(`Skipping banned wallet ${wallet} assigned to cluster ${change.clusterId}`)
      return
    }

    // Before the mint: LiveKit revokes tokens whose nbf is before the stamp at second
    // granularity, so the new session's token must not exist yet when the stamp is taken.
    if (change.displacedSession) {
      await evictDisplacedSession(wallet, change)
    }

    const room = livekit.getIslandRoomName(change.clusterId)

    // No suppression for a repeat/no-op assignment - Pulse only re-announces a cluster after
    // forgetting a peer, i.e. a reconnect that needs a fresh token (docs/ai-agent-context.md).
    const credentials = await livekit.generateCredentials(wallet, room, { cast: [] }, false)
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
      delivered = nats.publish(subject, IslandChangedMessage.encode(message).finish())
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
  // revokes every token minted for the wallet before now. Retried: this runs on a background
  // feed with nobody to report to, and a transient LiveKit error would otherwise leave two
  // sessions in comms until one of them leaves.
  async function evictDisplacedSession(wallet: string, change: PeerClusterChange): Promise<void> {
    if (!change.displacedClusterId) {
      metrics.increment('dcl_gatekeeper_cluster_takeover_failed_total')
      logger.warn(`Cannot evict displaced session ${change.displacedSession} of ${wallet}: no displaced cluster named`)
      return
    }

    const room = livekit.getIslandRoomName(change.displacedClusterId)
    for (let attempt = 1; attempt <= TAKEOVER_ATTEMPTS; attempt++) {
      try {
        await livekit.removeParticipant(room, wallet, new Date())
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

  // Re-announces the wallet's island because its comms session just started: Pulse's feed is
  // silent while a peer's cluster is unchanged (docs/ai-agent-context.md).
  async function processPeerConnect(wallet: string, session: string): Promise<void> {
    const entry = assignmentMirror.get(wallet)
    if (!entry) {
      metrics.increment('dcl_gatekeeper_cluster_reannounce_unresolved_total')
      return
    }

    // A connect from a device other than the one Pulse last published for is a displaced session
    // coming back; handing it the room would put it next to the live one under one identity.
    // A payload that is not a session key comes from an older WS Connector and cannot be judged.
    if (SESSION_KEY.test(session) && entry.session && entry.session !== session) {
      metrics.increment('dcl_gatekeeper_cluster_reannounce_skipped_other_session_total')
      return
    }

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
      // stranded peer stranded costs it one more reconnect; the other way costs it its session.
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
    await processClusterChange(wallet, {
      clusterId: entry.clusterId,
      realm: '',
      session: entry.session,
      displacedSession: '',
      displacedClusterId: ''
    })
  }

  // Serializes per wallet - an out-of-order mint would publish a stale room and corrupt
  // the next fromIslandId, and two concurrent cache misses could race on banCache. Connects
  // share the chain with cluster changes, so within one process a reconnect cannot interleave
  // with a move; across replicas nothing does, as the queue group has no per-wallet affinity.
  // Keyed per wallet so one slow wallet can't stall the rest.
  const walletChains = new Map<string, Promise<void>>()

  function enqueue(wallet: string, task: () => Promise<void>): Promise<void> {
    const previous = walletChains.get(wallet) ?? Promise.resolve()
    const result = previous.then(task)
    // Must never reject, or later events queued behind it would stay stuck. The caller still
    // sees this event's own rejection via the returned `result` promise.
    const tail = result.catch(() => {})
    walletChains.set(wallet, tail)
    void tail.finally(() => {
      if (walletChains.get(wallet) === tail) {
        walletChains.delete(wallet)
      }
    })
    return result
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
  // the mirror, and the session-addressed subject choice - agrees on its casing.
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

    void enqueue(wallet, () => processClusterChange(wallet, change)).catch((error) => {
      logger.error(`Cannot process cluster_change for ${wallet}: ${getErrorMessage(error)}`)
    })
  }

  function handleAssignmentMirror(wallet: string, data: Uint8Array): void {
    const { clusterId, session } = normalizeChange(PeerClusterChange.decode(data))
    if (clusterId) {
      assignmentMirror.set(wallet, { clusterId, session })
    }
  }

  function handlePeerConnect(wallet: string, data: Uint8Array): void {
    metrics.increment('dcl_gatekeeper_cluster_connects_received_total')
    const session = Buffer.from(data).toString('utf8').toLowerCase()

    void enqueue(wallet, () => processPeerConnect(wallet, session)).catch((error) => {
      logger.error(`Cannot process connect for ${wallet}: ${getErrorMessage(error)}`)
    })
  }

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
    nats.subscribe('peer.*.cluster_change', guarded('cluster_change', handleClusterChange), { queue: queueGroup })

    // Same subject again, this time with no queue group, so every replica sees every
    // assignment. This copy only refreshes the mirror; minting stays exclusive to the grouped
    // subscription above. Without it a replica knows only the assignments it happened to be
    // handed, and two replicas would re-announce the same wallet to different rooms.
    nats.subscribe('peer.*.cluster_change', guarded('cluster_change', handleAssignmentMirror))

    // Grouped like minting, and for the same reason: the mirror leaves every replica able to
    // answer a reconnect, so ungrouped they all would, and the client would be told to join
    // one room once per replica - every join after the first evicting the one before it.
    nats.subscribe('peer.*.connect', guarded('connect', handlePeerConnect), { queue: queueGroup })

    // Not awaited - well-known-components gates HTTP readiness (/health/ready, /health/startup)
    // on start() resolving, and connect() can stall ~20s per unreachable broker address before
    // giving up. It never throws and retries in the background regardless, so awaiting here
    // would only cost readiness time (src/adapters/nats/component.ts).
    void nats.connect()

    logger.info(`Cluster subscriber started (queue group: ${queueGroup})`)
  }

  return { [START_COMPONENT]: start }
}
