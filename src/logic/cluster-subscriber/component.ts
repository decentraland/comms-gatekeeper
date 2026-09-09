import { IslandChangedMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import { PeerClusterChange } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { START_COMPONENT } from '@well-known-components/interfaces'
import { LRUCache } from 'lru-cache'
import { cachedFetchComponent } from '../../adapters/fetch'
import { getErrorMessage } from '../errors'
import { AppComponents } from '../../types'
import { positiveNumberOr } from '../../utils/config'
import { IClusterSubscriberComponent } from './types'

const DEFAULT_BAN_CACHE_TTL_MS = 30_000
const BAN_CACHE_MAX = 20_000
const DEFAULT_QUEUE_GROUP = 'comms-gatekeeper-cluster'

/**
 * How long one realm's island board is reused for, and how many realms are held at once.
 *
 * Two seconds is short enough that a peer re-clustered mid-storm is answered with the new board
 * on its next reconnect, and long enough that a ws-connector redeploy - every connected peer
 * re-handshaking within seconds - reaches Pulse as one read per realm per replica instead of one
 * per peer. The in-flight de-duplication the cache brings with it is the half that matters most:
 * a storm's reads are concurrent, so they collapse onto a single request whatever the TTL is.
 */
const DEFAULT_ISLANDS_CACHE_TTL_MS = 2_000
const ISLANDS_CACHE_MAX = 512

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
 * Why a `connect` could not be answered, as the `reason` label of
 * `island_resend_skipped_total`. Kept apart because they mean different things to an operator:
 * `not_in_map` is expected for as long as `PRESENCE_MAP_ENABLED` is off, `not_clustered` is
 * Pulse saying the peer is not in an island yet, and `lookup_failed` is an incident.
 */
type SkipReason = 'banned' | 'not_in_map' | 'not_clustered' | 'lookup_failed' | 'publish_failed' | 'error'

/** Where a re-sent room came from, as the `source` label of `island_resend_total`. */
type ClusterSource = 'pulse' | 'peer_state'

/** The outcome of resolving which cluster a reconnecting wallet is in. */
type Resolution = { clusterId: string; source: ClusterSource } | { skipReason: SkipReason }

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

  const [enabledFlag, queueGroupSetting, banCacheTtlSetting, islandsCacheTtlSetting, pulseUrlSetting] =
    await Promise.all([
      config.getString('CLUSTER_SUBSCRIBER_ENABLED'),
      config.getString('NATS_QUEUE_GROUP'),
      config.getNumber('CLUSTER_BAN_CACHE_TTL_MS'),
      config.getNumber('CLUSTER_ISLANDS_CACHE_TTL_MS'),
      config.getString('PULSE_URL')
    ])

  const enabled = enabledFlag === 'true'
  const queueGroup = queueGroupSetting || DEFAULT_QUEUE_GROUP
  // Read unvalidated on purpose: the only caller is the connect resolution path, which is
  // unreachable unless the presence map holds the wallet, which means the map is on — and the
  // presence-map component refuses to build with an unusable `PULSE_URL` while it is.
  const pulseUrl = pulseUrlSetting?.replace(/\/+$/, '')

  // The repo's caching, request-collapsing fetch rather than a raw one: `peer.*.connect` is a
  // per-handshake signal, so a reconnect storm would otherwise read the realm's entire island
  // board once per peer. Its `fetchMethod` is also what releases the undici body on the
  // non-ok path (src/adapters/fetch.ts), which a hand-rolled read here kept forgetting.
  const islandsCache = (
    await cachedFetchComponent(
      { fetch, logs },
      {
        max: ISLANDS_CACHE_MAX,
        // Guarded rather than `??`, like the ban cache: a configured 0 means "never expires"
        // to lru-cache, which would pin every realm's board for the process's whole life.
        ttl: positiveNumberOr(islandsCacheTtlSetting, DEFAULT_ISLANDS_CACHE_TTL_MS)
      }
    )
  ).cache<RealmIslandsResponse>()

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
   * @param options.fromRoom - The room the peer is leaving, for `fromIslandId`. Absent on a
   * first assignment and on a re-send, which is not a move.
   * @param options.recordAssignment - Whether to store the assignment once it is on the wire.
   * Only `cluster_change` may: it is the subject that *decides* the room, and refreshing an
   * entry from a `connect` would renew the TTL of an assignment this replica may no longer own.
   * @returns Whether the message reached NATS. The caller counts its own success metric on it,
   * so the two subjects stay separable on the dashboard.
   */
  async function mintAndPublish(
    wallet: string,
    clusterId: string,
    options: { fromRoom?: string; recordAssignment: boolean }
  ): Promise<boolean> {
    const { fromRoom, recordAssignment } = options
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

    if (recordAssignment) {
      peerState.set(wallet, { clusterId, room, lastSeen: Date.now() })
    }

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
    if (await mintAndPublish(wallet, clusterId, { fromRoom: previous?.room, recordAssignment: true })) {
      metrics.increment('dcl_gatekeeper_cluster_published_total')
    }
  }

  /**
   * Reads one realm's island board from Pulse, through the per-realm cache.
   *
   * Never throws: an unreachable Pulse is a skipped or fallen-back re-send, not a broken
   * subscription.
   *
   * @param realm - The realm to ask about, as the presence map spells it.
   * @returns The board, or `undefined` when Pulse could not be asked.
   */
  async function readIslands(realm: string, wallet: string): Promise<RealmIslandsResponse | undefined> {
    const url = `${pulseUrl}/realms/${encodeURIComponent(realm)}/islands`

    try {
      // Rejects on a non-ok status too, with the status in the message, and releases the body
      // before it does (src/adapters/fetch.ts).
      return await islandsCache.fetch(url)
    } catch (error) {
      logger.warn(`Cannot resolve the cluster of ${wallet} from ${url}: ${getErrorMessage(error)}`)
      return undefined
    }
  }

  /**
   * Resolves which cluster a reconnecting wallet is in, in the order A9's revision pins.
   *
   * `peerState` is an in-process LRU written only by the replica the queue group handed that
   * wallet's last `cluster_change` to, and `peer.*.cluster_change` and `peer.*.connect` are
   * distributed independently — so the replica a `connect` lands on is usually *not* the one
   * that recorded the assignment, and may be holding one another replica has since replaced.
   * Nothing invalidates it: there is no broadcast and no shared store. A local hit therefore
   * must never pre-empt the authoritative read:
   *
   * 1. The presence map places the wallet in a realm → Pulse's `GET /realms/{realm}/islands`
   *    decides, including when it decides the peer is in no island (Pulse publishes the first
   *    assignment itself once it clusters the peer).
   * 2. Nothing places it in a realm — the map is off, or has not seen it — → `peerState`, which
   *    is exactly right for a single-replica deployment and for the map-off window.
   * 3. The map places it but Pulse cannot be asked → `peerState` as a stopgap, labelled as
   *    such. A possibly superseded room beats no answer while the authority is unreachable, and
   *    Pulse re-publishes the assignment itself once it is back.
   *
   * @param wallet - The lower-cased wallet address.
   * @returns The cluster and where it came from, or why the connect cannot be answered.
   */
  async function resolveClusterId(wallet: string): Promise<Resolution> {
    function remembered(): Resolution | undefined {
      const clusterId = peerState.get(wallet)?.clusterId
      return clusterId ? { clusterId, source: 'peer_state' } : undefined
    }

    const realm = presenceMap.get(wallet)?.realm
    if (!realm || !pulseUrl) {
      return remembered() ?? { skipReason: 'not_in_map' }
    }

    const board = await readIslands(realm, wallet)
    if (!board) {
      return remembered() ?? { skipReason: 'lookup_failed' }
    }

    for (const island of board.islands ?? []) {
      if (island?.id && (island.peers ?? []).some((peer) => peer?.address?.toLowerCase() === wallet)) {
        return { clusterId: island.id, source: 'pulse' }
      }
    }

    // Standing in a realm is not the same fact as being clustered, and this is the authority
    // saying so — so it outranks whatever this replica remembers, which would otherwise send the
    // peer to a room Pulse has just said it is not in.
    logger.info(`No island in realm ${realm} holds ${wallet}; leaving the first assignment to Pulse`)
    return { skipReason: 'not_clustered' }
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
   * It also never writes `peerState`: which room this subject *announces* is decided by
   * `resolveClusterId`, and only `cluster_change` decides which room a peer is in.
   *
   * Banned wallets are skipped the same way `cluster_change` skips them, counting the shared
   * moderation metric — and also `island_resend_skipped_total{reason="banned"}`, so that every
   * connect received is accounted for by exactly one of resent and skipped.
   *
   * @param wallet - The lower-cased wallet address.
   */
  async function processConnect(wallet: string): Promise<void> {
    if (await isBanned(wallet)) {
      metrics.increment('dcl_gatekeeper_cluster_banned_skipped_total')
      metrics.increment('island_resend_skipped_total', { reason: 'banned' })
      logger.info(`Skipping the island re-send for banned wallet ${wallet}`)
      return
    }

    const resolved = await resolveClusterId(wallet)
    if (!('clusterId' in resolved)) {
      metrics.increment('island_resend_skipped_total', { reason: resolved.skipReason })
      return
    }

    const { clusterId, source } = resolved
    if (await mintAndPublish(wallet, clusterId, { recordAssignment: false })) {
      metrics.increment('island_resend_total', { source })
      logger.debug(`Re-sent island ${clusterId} to ${wallet} after its handshake (from ${source})`)
    } else {
      // The publish failure counts its own metric inside mintAndPublish; this keeps the connect
      // funnel exact rather than losing the event between the two counters.
      metrics.increment('island_resend_skipped_total', { reason: 'publish_failed' })
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

      metrics.increment('dcl_gatekeeper_cluster_connect_events_received_total')

      void enqueue(wallet, () => processConnect(wallet)).catch((error) => {
        // Counted as a skip as well, so `received = resent + skipped` holds through an
        // unexpected failure (a LiveKit outage, say) instead of the event vanishing.
        metrics.increment('island_resend_skipped_total', { reason: 'error' })
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
