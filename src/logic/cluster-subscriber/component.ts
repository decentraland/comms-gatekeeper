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
 * Off unless `CLUSTER_SUBSCRIBER_ENABLED` is `'true'` and NATS is configured; when off it
 * subscribes to nothing and is byte-identical to not having the component at all.
 *
 * @param components - The config, logs, metrics, nats, livekit, access gate, player connection
 * database and peer state components.
 * @returns The cluster subscriber component. It only exposes a lifecycle hook; everything else
 * it does is driven by the feed.
 */
export async function createClusterSubscriberComponent(
  components: Pick<
    AppComponents,
    'config' | 'logs' | 'metrics' | 'nats' | 'livekit' | 'accessGate' | 'playerConnectionDb' | 'peerState'
  >
): Promise<IClusterSubscriberComponent> {
  const { config, logs, metrics, nats, livekit, accessGate, playerConnectionDb, peerState } = components
  const logger = logs.getLogger('cluster-subscriber')

  const [enabledFlag, queueGroupSetting, banCacheTtlSetting] = await Promise.all([
    config.getString('CLUSTER_SUBSCRIBER_ENABLED'),
    config.getString('NATS_QUEUE_GROUP'),
    config.getNumber('CLUSTER_BAN_CACHE_TTL_MS')
  ])

  const enabled = enabledFlag === 'true'
  const queueGroup = queueGroupSetting || DEFAULT_QUEUE_GROUP

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

  async function processClusterChange(wallet: string, clusterId: string): Promise<void> {
    if (await isBanned(wallet)) {
      metrics.increment('dcl_gatekeeper_cluster_banned_skipped_total')
      logger.info(`Skipping banned wallet ${wallet} assigned to cluster ${clusterId}`)
      return
    }

    const room = livekit.getIslandRoomName(clusterId)

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

    let delivered: boolean
    try {
      // Never hoist a shared encoder across the mint's await above - that would corrupt frames.
      delivered = nats.publish(`engine.peer.${wallet}.island_changed`, IslandChangedMessage.encode(message).finish())
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
    peerState.set(wallet, { clusterId, room, lastSeen: Date.now() })
  }

  // Serializes processClusterChange per wallet - an out-of-order mint would publish a
  // superseded room and corrupt the next fromIslandId, and two concurrent cache misses could
  // race on banCache. Keyed per wallet so one slow wallet can't stall the rest.
  const walletChains = new Map<string, Promise<void>>()

  function enqueueClusterChange(wallet: string, clusterId: string): Promise<void> {
    const previous = walletChains.get(wallet) ?? Promise.resolve()
    const result = previous.then(() => processClusterChange(wallet, clusterId))
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

      void enqueueClusterChange(wallet, change.clusterId).catch((error) => {
        logger.error(`Cannot process cluster_change for ${wallet}: ${getErrorMessage(error)}`)
      })
    } catch (error) {
      logger.error(`Cannot process cluster_change message on ${subject}: ${getErrorMessage(error)}`)
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
    nats.subscribe('peer.*.cluster_change', handleClusterChange, { queue: queueGroup })

    // Not awaited - well-known-components gates HTTP readiness (/health/ready, /health/startup)
    // on start() resolving, and connect() can stall ~20s per unreachable broker address before
    // giving up. It never throws and retries in the background regardless, so awaiting here
    // would only cost readiness time (src/adapters/nats/component.ts).
    void nats.connect()

    logger.info(`Cluster subscriber started (queue group: ${queueGroup})`)
  }

  return { [START_COMPONENT]: start }
}
