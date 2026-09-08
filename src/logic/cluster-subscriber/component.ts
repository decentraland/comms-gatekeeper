import { IslandChangedMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import { PeerClusterChange } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { START_COMPONENT } from '@well-known-components/interfaces'
import { LRUCache } from 'lru-cache'
import { getErrorMessage } from '../errors'
import { AppComponents } from '../../types'
import { positiveNumberOr } from '../../utils/config'
import { IClusterSubscriberComponent } from './types'

const DEFAULT_BAN_CACHE_TTL_MS = 30_000
const BAN_CACHE_MAX = 20_000
const DEFAULT_QUEUE_GROUP = 'comms-gatekeeper-cluster'

/** Pulse's cluster feed: one subject per wallet, wildcarded. */
const CLUSTER_CHANGE_SUBJECT = 'peer.*.cluster_change'

/**
 * ws-connector's post-handshake signal, one subject per wallet. The payload is empty — the
 * subject carries the address — and it is deliberately never decoded.
 */
const CONNECT_SUBJECT = 'peer.*.connect'

/** The shape this service reads out of Pulse's `GET /realms/{realm}/islands`. */
type RealmIslandsResponse = {
  islands?: { id?: string; peers?: { address?: string }[] }[]
}

/**
 * Creates the subscriber that translates Pulse's cluster feed into LiveKit connection strings
 * (see docs/ai-agent-context.md).
 *
 * Per inbound `peer.*.cluster_change`:
 * 1. Extract the wallet from the subject and decode the payload, discarding anything malformed.
 * 2. Serialize per wallet, then run the platform-access gate, skipping banned or deny-listed peers.
 * 3. Mint a LiveKit token for the cluster's island room.
 * 4. Publish `engine.peer.{wallet}.island_changed`, carrying the previous room as `fromIslandId`.
 * 5. Record the new assignment in peer state.
 *
 * Per inbound `peer.*.connect` (ws-connector, after every successful handshake) the same peer's
 * *current* island is re-sent with a fresh token and no `fromIslandId` — see `processConnect`.
 *
 * Off unless `CLUSTER_SUBSCRIBER_ENABLED` is `'true'` and NATS is configured; when off it
 * subscribes to nothing and is byte-identical to not having the component at all.
 *
 * @param components - The config, logs, metrics, nats, livekit, access gate, player connection
 * database, peer state, presence map and fetch components.
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
    | 'presenceMap'
    | 'fetch'
  >
): Promise<IClusterSubscriberComponent> {
  const { config, logs, metrics, nats, livekit, accessGate, playerConnectionDb, peerState, presenceMap, fetch } =
    components
  const logger = logs.getLogger('cluster-subscriber')

  const [enabledFlag, queueGroupSetting, banCacheTtlSetting, pulseUrlSetting] = await Promise.all([
    config.getString('CLUSTER_SUBSCRIBER_ENABLED'),
    config.getString('NATS_QUEUE_GROUP'),
    config.getNumber('CLUSTER_BAN_CACHE_TTL_MS'),
    config.getString('PULSE_URL')
  ])

  const enabled = enabledFlag === 'true'
  const queueGroup = queueGroupSetting || DEFAULT_QUEUE_GROUP
  // Read unvalidated on purpose: the only caller is the connect recovery path, which is
  // unreachable unless the presence map holds the wallet, which means the map is on — and the
  // presence-map component refuses to build with an unusable `PULSE_URL` while it is.
  const pulseUrl = pulseUrlSetting?.replace(/\/+$/, '')

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

  /**
   * Mints a LiveKit token for a cluster's island room and publishes the `island_changed` that
   * carries it, recording the assignment once the message is actually on the wire.
   *
   * @param wallet - The lower-cased wallet address.
   * @param clusterId - The cluster to announce.
   * @param fromRoom - The room the peer is leaving, for `fromIslandId`. Absent on a first
   * assignment and on a re-send, which is not a move.
   * @returns Whether the message reached NATS. The caller counts its own success metric on it,
   * so the two subjects stay separable on the dashboard.
   */
  async function mintAndPublish(wallet: string, clusterId: string, fromRoom?: string): Promise<boolean> {
    const room = livekit.getIslandRoomName(clusterId)

    const credentials = await livekit.generateCredentials(wallet, room, { cast: [] }, false)
    metrics.increment('dcl_gatekeeper_cluster_tokens_minted_total')

    const message: IslandChangedMessage = {
      islandId: room,
      connStr: livekit.buildConnectionUrl(credentials.url, credentials.token),
      // Empty by design: unity-explorer reads only connStr (see docs/ai-agent-context.md).
      peers: {}
    }
    if (fromRoom) {
      // Omitted rather than set to '' when absent, matching what core put on the wire.
      message.fromIslandId = fromRoom
    }

    let delivered: boolean
    try {
      // Never hoist a shared encoder across the mint's await above - that would corrupt frames.
      delivered = nats.publish(`engine.peer.${wallet}.island_changed`, IslandChangedMessage.encode(message).finish())
    } catch (error) {
      metrics.increment('dcl_gatekeeper_cluster_publish_failed_total')
      logger.error(`Failed to publish island_changed for ${wallet}: ${getErrorMessage(error)}`)
      return false
    }

    // A dropped publish does not throw: the connection can go away during the mint above, and
    // the adapter then discards the write. Counting that as published would make the metrics
    // lie exactly when the feed is broken, and storing the assignment would point the next
    // fromIslandId at a room this peer was never told to join.
    if (!delivered) {
      metrics.increment('dcl_gatekeeper_cluster_publish_failed_total')
      logger.error(`Dropped island_changed for ${wallet}: no NATS connection to publish on`)
      return false
    }

    peerState.set(wallet, { clusterId, room, lastSeen: Date.now() })
    return true
  }

  async function processClusterChange(wallet: string, clusterId: string): Promise<void> {
    if (await isBanned(wallet)) {
      metrics.increment('dcl_gatekeeper_cluster_banned_skipped_total')
      logger.info(`Skipping banned wallet ${wallet} assigned to cluster ${clusterId}`)
      return
    }

    // Read before the mint, which is safe because everything for one wallet is serialized on the
    // same chain: nothing else can write this wallet's state while this event is in flight.
    const previous = peerState.get(wallet)

    // No suppression for a repeat/no-op assignment - Pulse only re-announces a cluster after
    // forgetting a peer, i.e. a reconnect that needs a fresh token (docs/ai-agent-context.md).
    if (await mintAndPublish(wallet, clusterId, previous?.room)) {
      metrics.increment('dcl_gatekeeper_cluster_published_total')
    }
  }

  /**
   * Recovers the cluster a wallet is in from Pulse, for a `connect` this process holds no
   * assignment for — a fresh or restarted replica, or an entry `CLUSTER_PEER_STATE_TTL_MS`
   * retired.
   *
   * Two reads, because neither alone is enough: the presence map says which realm the wallet
   * stands in, and Pulse's `GET /realms/{realm}/islands` says which island of that realm holds
   * it. With the map off there is no realm to ask about, so this returns nothing and the connect
   * is skipped — which costs the peer nothing it was not already waiting for, since Pulse
   * publishes the assignment itself as soon as the peer is clustered.
   *
   * Never throws: an unreachable Pulse is a skipped re-send, not a broken subscription.
   *
   * @param wallet - The lower-cased wallet address.
   * @returns The cluster id, or `undefined` when it could not be established.
   */
  async function recoverClusterId(wallet: string): Promise<string | undefined> {
    const realm = presenceMap.get(wallet)?.realm
    if (!realm || !pulseUrl) {
      return undefined
    }

    const url = `${pulseUrl}/realms/${encodeURIComponent(realm)}/islands`

    try {
      const response = await fetch.fetch(url)
      if (!response.ok) {
        logger.warn(`Cannot recover the cluster of ${wallet} from ${url}: HTTP ${response.status}`)
        return undefined
      }

      const body = (await response.json()) as RealmIslandsResponse

      for (const island of body?.islands ?? []) {
        if (island?.id && (island.peers ?? []).some((peer) => peer?.address?.toLowerCase() === wallet)) {
          return island.id
        }
      }

      // Standing in a realm is not the same fact as being clustered: Pulse clusters a peer
      // shortly after it appears and publishes that first assignment itself.
      logger.info(`No island in realm ${realm} holds ${wallet}; leaving the first assignment to Pulse`)
      return undefined
    } catch (error) {
      logger.warn(`Cannot recover the cluster of ${wallet} from ${url}: ${getErrorMessage(error)}`)
      return undefined
    }
  }

  /**
   * Re-sends a peer's current island after a successful ws-connector handshake.
   *
   * The signal exists because iteration 2 retires the client heartbeat that used to hand a
   * reconnecting WebSocket its room back: without it a peer whose socket dropped would sit
   * roomless until Pulse next re-clustered it, which for a peer standing still is never.
   *
   * A re-send carries no `fromIslandId` — the peer is not moving — and always a freshly minted
   * token, because a stored one would be expiring exactly when a reconnecting client needs it.
   * Banned wallets are skipped the same way `cluster_change` skips them, and count the same
   * moderation metric rather than `island_resend_skipped_total`, which is about connects this
   * service could not answer.
   *
   * @param wallet - The lower-cased wallet address.
   */
  async function processConnect(wallet: string): Promise<void> {
    if (await isBanned(wallet)) {
      metrics.increment('dcl_gatekeeper_cluster_banned_skipped_total')
      logger.info(`Skipping the island re-send for banned wallet ${wallet}`)
      return
    }

    const clusterId = peerState.get(wallet)?.clusterId ?? (await recoverClusterId(wallet))
    if (!clusterId) {
      metrics.increment('island_resend_skipped_total')
      return
    }

    if (await mintAndPublish(wallet, clusterId)) {
      metrics.increment('island_resend_total')
      logger.debug(`Re-sent island ${clusterId} to ${wallet} after its handshake`)
    }
  }

  // Serializes everything done for one wallet, across both subjects - an out-of-order mint would
  // publish a superseded room and corrupt the next fromIslandId, a re-send racing an assignment
  // would announce the room the peer is leaving, and two concurrent cache misses could race on
  // banCache. Keyed per wallet so one slow wallet can't stall the rest.
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

  function handleClusterChange(subject: string, data: Uint8Array): void {
    // Kept small and synchronous, with every path guarded. A throw escaping here unwinds
    // into the NATS client's reader loop and stops delivery on every subject.
    try {
      // Wallet is the token after `peer.`.
      const wallet = subject.split('.')[1]?.toLowerCase()
      if (!wallet) {
        logger.warn(`Cannot extract a wallet from subject ${subject}`)
        return
      }

      const change = PeerClusterChange.decode(data)
      metrics.increment('dcl_gatekeeper_cluster_events_received_total')

      // After the received-counter: this is a payload problem, not a decode one. Protobuf
      // decodes a missing cluster_id as '', and unguarded that would dump every such peer into
      // one shared `island-` room.
      if (!change.clusterId) {
        logger.warn(`Cannot process cluster_change for ${wallet}: empty clusterId`)
        return
      }

      const clusterId = change.clusterId
      void enqueue(wallet, () => processClusterChange(wallet, clusterId)).catch((error) => {
        logger.error(`Cannot process cluster_change for ${wallet}: ${getErrorMessage(error)}`)
      })
    } catch (error) {
      logger.error(`Cannot process cluster_change message on ${subject}: ${getErrorMessage(error)}`)
    }
  }

  /**
   * Handles one `peer.{wallet}.connect`. The payload is empty by contract and deliberately not
   * decoded: the subject carries everything, so bytes that mean nothing must change nothing.
   */
  function handleConnect(subject: string): void {
    // Kept small and synchronous, with every path guarded, for the same reason
    // `handleClusterChange` is: a throw escaping here stops delivery on every subject.
    try {
      const wallet = subject.split('.')[1]?.toLowerCase()
      if (!wallet) {
        logger.warn(`Cannot extract a wallet from subject ${subject}`)
        return
      }

      void enqueue(wallet, () => processConnect(wallet)).catch((error) => {
        logger.error(`Cannot process connect for ${wallet}: ${getErrorMessage(error)}`)
      })
    } catch (error) {
      logger.error(`Cannot process connect message on ${subject}: ${getErrorMessage(error)}`)
    }
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
    nats.subscribe(CLUSTER_CHANGE_SUBJECT, handleClusterChange, { queue: queueGroup })

    // Same group, same reason. Nothing publishes this subject until ws-connector starts doing so,
    // so subscribing to it changes nothing on its own.
    nats.subscribe(CONNECT_SUBJECT, handleConnect, { queue: queueGroup })

    // Not awaited - well-known-components gates HTTP readiness (/health/ready, /health/startup)
    // on start() resolving, and connect() can stall ~20s per unreachable broker address before
    // giving up. It never throws and retries in the background regardless, so awaiting here
    // would only cost readiness time (src/adapters/nats/component.ts).
    void nats.connect()

    logger.info(`Cluster subscriber started (queue group: ${queueGroup})`)
  }

  return { [START_COMPONENT]: start }
}
