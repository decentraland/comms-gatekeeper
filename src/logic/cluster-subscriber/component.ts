import {
  IslandChangedMessage,
  IslandStatusMessage
} from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import { PeerClusterChange } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { LRUCache } from 'lru-cache'
import { isErrorWithMessage } from '../errors'
import { AppComponents } from '../../types'
import { createPeerStateStore } from './peer-state'
import { resolveRoom } from './rooms'
import { createClusterTopology } from './topology'
import { IClusterSubscriberComponent } from './types'

const DEFAULT_ROOM_SHARD_SIZE = 100
const DEFAULT_PEER_STATE_TTL_MS = 60 * 60 * 1000
const DEFAULT_PEER_STATE_MAX = 20_000
const DEFAULT_BAN_CACHE_TTL_MS = 30_000
const BAN_CACHE_MAX = 20_000
const DEFAULT_QUEUE_GROUP = 'comms-gatekeeper-cluster'

// Translates Pulse's cluster feed into LiveKit connection strings (see docs/ai-agent-context.md).
export async function createClusterSubscriberComponent(
  components: Pick<
    AppComponents,
    'config' | 'logs' | 'metrics' | 'nats' | 'livekit' | 'userModeration' | 'denyList' | 'playerConnectionDb'
  >
): Promise<IClusterSubscriberComponent> {
  const { config, logs, metrics, nats, livekit, userModeration, denyList, playerConnectionDb } = components
  const logger = logs.getLogger('cluster-subscriber')

  const [enabledFlag, natsUrl, subjectPrefix, queueGroupSetting] = await Promise.all([
    config.getString('CLUSTER_SUBSCRIBER_ENABLED'),
    config.getString('NATS_URL'),
    config.getString('NATS_SUBJECT_PREFIX'),
    config.getString('NATS_QUEUE_GROUP')
  ])
  const [shardSizeSetting, peerStateTtlSetting, peerStateMaxSetting, banCacheTtlSetting] = await Promise.all([
    config.getNumber('ROOM_SHARD_SIZE'),
    config.getNumber('CLUSTER_PEER_STATE_TTL_MS'),
    config.getNumber('CLUSTER_PEER_STATE_MAX'),
    config.getNumber('CLUSTER_BAN_CACHE_TTL_MS')
  ])

  const enabled = enabledFlag === 'true'
  const prefix = subjectPrefix ?? ''
  const queueGroup = queueGroupSetting || DEFAULT_QUEUE_GROUP
  // Clamped to 1: a zero or negative shard size would make ceil(size / shardSize)
  // non-finite and every room name garbage.
  const shardSize = Math.max(1, shardSizeSetting ?? DEFAULT_ROOM_SHARD_SIZE)

  const topology = createClusterTopology()
  const peerState = createPeerStateStore({
    max: peerStateMaxSetting ?? DEFAULT_PEER_STATE_MAX,
    ttl: peerStateTtlSetting ?? DEFAULT_PEER_STATE_TTL_MS
  })
  // First ban cache in this service - the path was two uncached DB reads per event. A stale
  // hit is fine because banning also removes the participant from every live room.
  const banCache = new LRUCache<string, boolean>({
    max: BAN_CACHE_MAX,
    ttl: banCacheTtlSetting ?? DEFAULT_BAN_CACHE_TTL_MS
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
      const [banStatus, denylisted] = await Promise.all([
        userModeration.getActiveBanForConnection({ address: wallet, deviceId: connectionInfo?.deviceId ?? null }),
        denyList.isDenylisted(wallet)
      ])
      banned = banStatus.isBanned || denylisted
    } catch (error) {
      // Fails open, like every ban check here - a lookup outage must not stop island formation.
      // Deliberately not cached, so the next event retries instead of being wrong for the full TTL.
      logger.warn(
        `Ban check failed for ${wallet}, allowing: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
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

    const size = topology.getSize(clusterId)
    if (size === undefined) {
      // Cross-subject ordering is best-effort, so a just-formed cluster can be named
      // before it appears in the topology snapshot. Not an error.
      metrics.increment('dcl_gatekeeper_cluster_unknown_cluster_total')
      logger.warn(`Cluster ${clusterId} is not in the latest topology; using the unsharded room for ${wallet}`)
    }

    const { room, shard } = resolveRoom(clusterId, wallet, size, shardSize)

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

    try {
      // Deliberately unprefixed: WS Connector subscribes to the literal subject (see
      // docs/ai-agent-context.md). Never hoist a shared encoder across the mint's await above
      // - that would corrupt frames.
      nats.publish(`engine.peer.${wallet}.island_changed`, IslandChangedMessage.encode(message).finish())
      metrics.increment('dcl_gatekeeper_cluster_published_total')
    } catch (error) {
      metrics.increment('dcl_gatekeeper_cluster_publish_failed_total')
      logger.error(
        `Failed to publish island_changed for ${wallet}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      return
    }

    peerState.set(wallet, { clusterId, shard, room, lastSeen: Date.now() })
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

  function handleIslands(subject: string, data: Uint8Array): void {
    try {
      topology.update(IslandStatusMessage.decode(data))
    } catch (error) {
      logger.error(`Cannot process ${subject} message: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`)
    }
  }

  function handleClusterChange(subject: string, data: Uint8Array): void {
    // Kept small and synchronous, with every path guarded. A throw escaping here unwinds
    // into the NATS client's reader loop and stops delivery on every subject.
    try {
      // Wallet is the token after `peer.`, but the subject includes `prefix` first - stripping
      // it before splitting keeps this correct for any prefix length, not just an empty one.
      const wallet = subject.slice(prefix.length).split('.')[1]?.toLowerCase()
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
        logger.error(
          `Cannot process cluster_change for ${wallet}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
        )
      })
    } catch (error) {
      logger.error(
        `Cannot process cluster_change message on ${subject}: ${
          isErrorWithMessage(error) ? error.message : 'Unknown error'
        }`
      )
    }
  }

  async function start(): Promise<void> {
    if (!enabled) {
      logger.info('Cluster subscriber is disabled (CLUSTER_SUBSCRIBER_ENABLED is not "true")')
      return
    }
    if (!natsUrl) {
      logger.info('Cluster subscriber is enabled but NATS_URL is not set, staying idle')
      return
    }

    // No queue group: every replica needs the whole-world topology snapshot.
    nats.subscribe(`${prefix}engine.islands`, handleIslands)
    // Queue-grouped: without it, N replicas would each mint and publish for every event,
    // giving each client N island_changed messages with N different tokens.
    nats.subscribe(`${prefix}peer.*.cluster_change`, handleClusterChange, { queue: queueGroup })

    // Not awaited - well-known-components gates HTTP readiness (/health/ready, /health/startup)
    // on start() resolving, and connect() can stall ~20s per unreachable broker address before
    // giving up. It never throws and retries in the background regardless, so awaiting here
    // would only cost readiness time (src/adapters/nats.ts).
    void nats.connect()

    logger.info(
      `Cluster subscriber started (prefix: "${prefix}", queue group: ${queueGroup}, shard size: ${shardSize})`
    )
  }

  return { start }
}
