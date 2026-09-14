import { IslandChangedMessage } from '@dcl/protocol/out-js/decentraland/kernel/comms/v3/archipelago.gen'
import { PeerClusterChange } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import { START_COMPONENT } from '@well-known-components/interfaces'
import { LRUCache } from 'lru-cache'
import { ISLAND_SESSION_ATTRIBUTE } from '../../adapters/livekit'
import { NatsMessageHandler } from '../../adapters/nats'
import { getErrorMessage } from '../errors'
import { AppComponents } from '../../types'
import { ParticipantHold } from '../../types/livekit.type'
import { positiveNumberOr } from '../../utils/config'
import { IClusterSubscriberComponent } from './types'

const DEFAULT_BAN_CACHE_TTL_MS = 30_000
const BAN_CACHE_MAX = 20_000
const DEFAULT_QUEUE_GROUP = 'comms-gatekeeper-cluster'
const DEFAULT_TAKEOVER_RETRY_DELAY_MS = 100
const TAKEOVER_ATTEMPTS = 3
const SESSION_KEY = /^0x[0-9a-f]{40}$/
// A rolling window, not a full history (F4): only recent enough for a displaced device's own
// reconnect to still land inside it.
const MAX_DISPLACED_SESSIONS = 8

/**
 * Creates the subscriber that translates Pulse's cluster feed into LiveKit connection strings
 * (see docs/ai-agent-context.md).
 *
 * Per inbound `peer.*.cluster_change`:
 * 1. Extract the wallet from the subject and decode the payload, discarding anything malformed.
 * 2. Serialize per wallet, then run the platform-access gate, skipping banned or deny-listed peers.
 * 2a. When the event names a displaced session distinct from the new one, park it (F4) FIRST: mint
 * it a token into a private `island-parked-*` room and publish that as an ordinary island change,
 * addressed to the displaced session alone - LiveKit does not enforce revocation on a fresh join
 * on the measured build, so eviction alone cannot keep a removed device from rejoining the shared
 * room, and this is what actually does.
 * 2b. Then remove that participant from the cluster it was last published into, revoking its
 * tokens, before minting (N1: when that cluster is also the one about to be minted into, the
 * removal set is built only from the holders that do NOT already carry the new session, skipping
 * the removal entirely once none remain - another replica's connect-path self-heal may have
 * already healed some or all holders in; a holder that already carries the new session is never
 * removed).
 * 3. Mint a LiveKit token for the cluster's island room.
 * 4. Publish `engine.peer.{wallet}.island_changed.{session}` when the event names a valid session,
 * or the legacy `engine.peer.{wallet}.island_changed` when it does not (an older Pulse) — carrying
 * the previous room as `fromIslandId`.
 * 5. Record the new assignment in peer state.
 *
 * Per inbound `peer.*.connect` (a peer's comms session starting), the wallet's last known
 * island is re-announced through the same path, unless the connecting session differs from the
 * one last recorded for the wallet (that device was displaced) - unless that session is one the
 * mirror remembers Pulse having displaced for this wallet before, in which case it MAY be parked
 * (F4) rather than ignored, since its ws socket may simply have dropped and re-handshook - but
 * only after the ban gate, and only with positive evidence from LiveKit that the wallet's live
 * session still holds the room (B2: a device signing back in must never be parked into a dead
 * room), re-read against the mirror immediately before the park publish since the ungrouped
 * refresh can update the entry during those awaits (I1: an entry that vanished, now names this
 * session live, or no longer remembers it as displaced means it is signing back in for real);
 * without that evidence, or on a LiveKit error, it falls back to today's "other session" skip,
 * since Pulse's own `cluster_change` for it, if it is legitimately signing back in, follows
 * and assigns it normally. When both the connecting session and the mirror's recorded one are
 * real session keys, LiveKit's
 * participants for that identity are classified by their `dclsession` attribute: one matching
 * the connecting session means it is already in and the re-announce is suppressed; a different
 * valid session is a displaced device that outlived its eviction and is removed - by the exact
 * identity LiveKit listed it under, stamped with the takeover's receipt second - before
 * re-announcing; a missing attribute cannot be told apart from that same device, so it is
 * suppressed too, never evicted. When either side is not a real session key (an older WS
 * Connector's payload, or an older Pulse's session-less assignment), no holder could ever carry
 * a matching attribute, so any holder at all reads as already in - the identity-only check this
 * replaced. Nobody there is a plain reconnect. Pulse's feed only speaks when a peer's cluster
 * changes, so without this a client that reconnects standing still is never given a room.
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

  // Mints a token for `session` into `room`, builds the resulting IslandChangedMessage and
  // publishes it - the mint/build/publish core both a live assignment (processClusterChange) and
  // a parked one (parkDisplacedSession) need, so the parked path can never drift from how the
  // live one stamps the session attribute, addresses the subject, or handles a publish failure.
  // Never touches peerState or the assignment mirror - both describe the wallet's live session,
  // and a call minting for a displaced one is never that; the caller decides what "success" means
  // for it.
  //
  // @returns Whether the message was actually delivered.
  async function mintAndPublishIslandChange(
    wallet: string,
    room: string,
    session: string,
    fromRoom: string | undefined,
    isStillCurrent: () => boolean = () => true
  ): Promise<boolean> {
    // Stamped only for a genuine session key: an older Pulse names none, and a malformed one
    // must never ride into LiveKit as an attribute the connect re-announce would then trust.
    const attributes = SESSION_KEY.test(session) ? { [ISLAND_SESSION_ATTRIBUTE]: session } : undefined

    // No suppression for a repeat/no-op assignment - Pulse only re-announces a cluster after
    // forgetting a peer, i.e. a reconnect that needs a fresh token (docs/ai-agent-context.md).
    const credentials = await livekit.generateCredentials(wallet, room, { cast: [] }, false, undefined, attributes)
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

    // Addressed to the session whenever it is a valid one: an older Pulse sends no session, and a
    // malformed one must never become subject tokens, so both fall back to the legacy four-token
    // subject.
    const subject = SESSION_KEY.test(session)
      ? `engine.peer.${wallet}.island_changed.${session}`
      : `engine.peer.${wallet}.island_changed`

    // Recheck after the final await: a newer mirror event invalidates this reply.
    if (!isStillCurrent()) return false

    let delivered: boolean
    try {
      // Never hoist a shared encoder across the mint's await above - that would corrupt frames.
      delivered = nats.publish(subject, IslandChangedMessage.encode(message).finish())
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

    return true
  }

  // Parks the displaced session into a private room nobody else is ever assigned to (F4):
  // livekit-server v1.13.6 does not enforce token revocation on a fresh join (measured, see
  // docs/ai-agent-context.md), so a removed device can simply reconnect with the connection
  // string it already holds, and in a shared room LiveKit then disconnects the *live*
  // participant under that identity instead. What every client does honour is its latest island
  // assignment, so this hands the displaced session one - an ordinary island change, requiring no
  // client change - to a room the shared one's clients are never told to join.
  //
  // Never touches peerState or the assignment mirror, which describe the wallet's live session,
  // and never throws: called before the eviction and the live mint on the direct path, and as the
  // whole of a connect event on the reconnect path, so a parking failure must not block either.
  //
  // @returns Whether the parking message was actually delivered, so the caller can count its own
  // "parked" metric only when it was.
  async function parkDisplacedSession(
    wallet: string,
    displacedSession: string,
    fromRoom: string | undefined,
    isStillCurrent: () => boolean = () => true
  ): Promise<boolean> {
    const parkedRoom = livekit.getIslandRoomName(`parked-${displacedSession.slice(2, 18)}`)
    try {
      return await mintAndPublishIslandChange(wallet, parkedRoom, displacedSession, fromRoom, isStillCurrent)
    } catch (error) {
      metrics.increment('dcl_gatekeeper_cluster_publish_failed_total')
      logger.error(`Failed to park displaced session ${displacedSession} of ${wallet}: ${getErrorMessage(error)}`)
      return false
    }
  }

  async function processClusterChange(
    wallet: string,
    change: PeerClusterChange,
    receivedAt: number,
    isStillCurrent: () => boolean = () => true
  ): Promise<void> {
    if (await isBanned(wallet)) {
      metrics.increment('dcl_gatekeeper_cluster_banned_skipped_total')
      logger.info(`Skipping banned wallet ${wallet} assigned to cluster ${change.clusterId}`)
      return
    }

    if (!isStillCurrent()) return

    if (change.displacedSession) {
      // F4: park the displaced session BEFORE evicting it or minting the new one, when it genuinely
      // names a different device - a session equal to the new one, or too malformed to address a
      // token to, has nowhere useful to be parked.
      if (SESSION_KEY.test(change.displacedSession) && change.displacedSession !== change.session) {
        const previousRoom = peerState.get(wallet)?.room ?? livekit.getIslandRoomName(change.displacedClusterId)
        if (await parkDisplacedSession(wallet, change.displacedSession, previousRoom)) {
          metrics.increment('dcl_gatekeeper_cluster_takeover_parked_total')
        }
      }

      // The revocation stamp is the takeover's receipt second, not "now" (F2a): every token of
      // the new session - minted below or by another replica's connect-path re-announce - is born
      // at or after it, and every token of the displaced device predates it, so eviction can never
      // revoke a session it did not mean to.
      await evictDisplacedSession(wallet, change, receivedAt)
    }

    const room = livekit.getIslandRoomName(change.clusterId)
    const previous = peerState.get(wallet)

    const delivered = await mintAndPublishIslandChange(wallet, room, change.session, previous?.room, isStillCurrent)
    if (!delivered) {
      return
    }

    metrics.increment('dcl_gatekeeper_cluster_published_total')
    peerState.set(wallet, { clusterId: change.clusterId, room, lastSeen: Date.now() })
  }

  // Removes the displaced session's participant from the room it was last published into and
  // revokes every token minted for the wallet before the takeover's receipt second (F2a) - not
  // "now", so a retry after a transient LiveKit error cannot revoke a token minted for the new
  // session in between attempts. Retried: this runs on a background feed with nobody to report
  // to, and a transient LiveKit error would otherwise leave two sessions in comms until one of
  // them leaves.
  async function evictDisplacedSession(wallet: string, change: PeerClusterChange, receivedAt: number): Promise<void> {
    if (!change.displacedClusterId) {
      metrics.increment('dcl_gatekeeper_cluster_takeover_failed_total')
      logger.warn(`Cannot evict displaced session ${change.displacedSession} of ${wallet}: no displaced cluster named`)
      return
    }

    const room = livekit.getIslandRoomName(change.displacedClusterId)
    // Hoisted out of the loop (F2a/I2): every attempt stamps with the same receipt second, so a
    // later retry can never revoke a token another replica minted for the new session meanwhile.
    const stamp = new Date(receivedAt)

    async function removeWithRetries(identity: string): Promise<void> {
      for (let attempt = 1; attempt <= TAKEOVER_ATTEMPTS; attempt++) {
        // Another replica can admit the winner under this identity between attempts.
        if (attempt > 1 && change.displacedClusterId === change.clusterId && SESSION_KEY.test(change.session)) {
          let currentHolders: ParticipantHold[] | undefined
          try {
            currentHolders = await livekit.listParticipantsHolding(room, wallet)
          } catch {
            // Preserve the direct takeover's fail-closed eviction policy on lookup errors.
          }
          if (currentHolders) {
            const holder = currentHolders.find((candidate) => candidate.identity === identity)
            if (!holder) {
              metrics.increment('dcl_gatekeeper_cluster_takeover_absent_total')
              return
            }
            if (holder.session === change.session) {
              metrics.increment('dcl_gatekeeper_cluster_takeover_skipped_live_total')
              return
            }
          }
        }
        try {
          await livekit.removeParticipant(room, identity, stamp)
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

    // N1: when the displaced cluster is also the room the new session is about to join, another
    // replica's connect-path self-heal may have already evicted the displaced device and
    // re-announced the new session into it - removing by `wallet` here, identity-wide, would then
    // kick the very device this whole fix exists to protect. Listed first, so this path never
    // removes a holder that positively carries the session Pulse just named; a listing failure
    // still falls through to the identity-wide removal below, since a takeover that fails to evict
    // is the worse failure (fail closed towards eviction).
    if (change.displacedClusterId === change.clusterId && SESSION_KEY.test(change.session)) {
      // Narrowed to the listing call only (M1): removeWithRetries never throws today - every path
      // through its loop returns - but if a future edit inside it ever did, this catch must not
      // also swallow that and fall through to a second, identity-wide removal below, exactly what
      // N1 forbids.
      let holders: ParticipantHold[] | undefined
      try {
        holders = await livekit.listParticipantsHolding(room, wallet)
      } catch {
        holders = undefined
      }

      if (holders) {
        if (holders.length === 0) {
          // Nothing under this identity right now - equivalent to the not_found case below, but
          // known up front rather than discovered by attempting a removal.
          metrics.increment('dcl_gatekeeper_cluster_takeover_absent_total')
          logger.debug(
            `Displaced session ${change.displacedSession} of ${wallet} was no longer in ${room}; nothing to remove`
          )
          return
        }

        // I4: the removal set is built only from the STALE holders - those that do not carry the
        // new session - never from every holder listed. A holder already carrying `change.session`
        // is the device this whole guard exists to protect, and must never be removed even when a
        // displaced or attribute-less holder is listed alongside it under a different identity.
        const stale = holders.filter((holder) => holder.session !== change.session)
        if (stale.length === 0) {
          metrics.increment('dcl_gatekeeper_cluster_takeover_skipped_live_total')
          logger.debug(
            `Skipping takeover removal of ${wallet} from ${room}: every holder already carries session ${change.session}`
          )
          return
        }

        // Removed by the exact identity LiveKit listed it under, deduped - not `wallet` wholesale,
        // since a foreign or legacy mint can be checksum-cased (I1's fix, extended here now that
        // the listing already ran).
        const identities = new Set(stale.map((holder) => holder.identity))
        for (const identity of identities) {
          await removeWithRetries(identity)
        }
        return
      }
      // Cannot tell -> fall through and remove by wallet, identity-wide, as below.
    }

    await removeWithRetries(wallet)
  }

  // Re-announces the wallet's island because its comms session just started: Pulse's feed is
  // silent while a peer's cluster is unchanged (docs/ai-agent-context.md).
  async function processPeerConnect(wallet: string, session: string): Promise<void> {
    const entry = assignmentMirror.get(wallet)
    if (!entry) {
      metrics.increment('dcl_gatekeeper_cluster_reannounce_unresolved_total')
      return
    }

    // Mirror updates bypass the per-wallet mint queue. Discard an async reply once a
    // newer feed event has replaced the assignment it was based on.
    function isStillCurrent(): boolean {
      if (assignmentMirror.get(wallet) === entry) return true
      metrics.increment('dcl_gatekeeper_cluster_reannounce_skipped_other_session_total')
      logger.debug('Not re-announcing ' + wallet + ': the mirror changed while checking')
      return false
    }

    // A connect from a device other than the one Pulse last published for is a displaced session
    // coming back; handing it the room would put it next to the live one under one identity.
    // A payload that is not a session key comes from an older WS Connector and cannot be judged.
    if (SESSION_KEY.test(session) && entry.session && entry.session !== session) {
      // F4/B2: unless the mirror remembers Pulse having displaced this very session for the
      // wallet before - its ws socket may simply have dropped and re-handshook - in which case it
      // MAY get the same parking assignment as a takeover would give it, rather than nothing. But
      // a device signing back in re-handshakes with this exact same session key, so parking on the
      // remembered-displaced fact alone would park a returning device. Ban gate first, same as the
      // mint path, then require positive evidence - the mirror's live session must still hold the
      // room - before parking; without it, or on a LiveKit error, this falls back to today's
      // "other session" skip, since Pulse's own cluster_change for a genuine sign-in follows.
      if (entry.displaced.includes(session)) {
        if (await isBanned(wallet)) {
          metrics.increment('dcl_gatekeeper_cluster_banned_skipped_total')
          logger.info(`Skipping banned wallet ${wallet} on a parked reconnect check`)
          return
        }

        const parkRoom = livekit.getIslandRoomName(entry.clusterId)
        let liveStillHolds: boolean
        try {
          const holders = await livekit.listParticipantsHolding(parkRoom, wallet)
          liveStillHolds = holders.some((holder) => holder.session === entry.session)
        } catch (error) {
          logger.debug(
            `Cannot tell whether ${wallet}'s live session still holds ${parkRoom}, not parking ${session}: ${getErrorMessage(error)}`
          )
          metrics.increment('dcl_gatekeeper_cluster_reannounce_skipped_other_session_total')
          return
        }

        if (!liveStillHolds) {
          logger.debug(
            `Not parking ${session} of ${wallet}: the live session no longer holds ${parkRoom}, likely signing back in`
          )
          metrics.increment('dcl_gatekeeper_cluster_reannounce_skipped_other_session_total')
          return
        }

        // I1: the mirror refresh is ungrouped, so a `cluster_change` naming this very session live
        // can land on this replica while the ban gate and the listing above were awaited - the
        // entry captured at :414 is then stale. Re-read it immediately before the park publish:
        // a missing entry, one that now names this session live, or one that no longer remembers
        // it as displaced all mean the connecting session is signing back in for real, and Pulse's
        // own re-announce - not this stale snapshot - is what must assign it.
        if (!isStillCurrent()) return

        logger.debug(`Parking ${session} of ${wallet}: the live session still holds ${parkRoom}`)
        if (await parkDisplacedSession(wallet, session, parkRoom, isStillCurrent)) {
          metrics.increment('dcl_gatekeeper_cluster_reannounce_parked_total')
        }
        return
      }

      metrics.increment('dcl_gatekeeper_cluster_reannounce_skipped_other_session_total')
      return
    }

    const room = livekit.getIslandRoomName(entry.clusterId)

    let holders: ParticipantHold[]
    try {
      holders = await livekit.listParticipantsHolding(room, wallet)
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

    if (!isStillCurrent()) return

    // Judgeable only when both sides name a real session key: an older WS Connector's connect
    // payload names none, and an older Pulse's assignment mints no attribute, so no holder could
    // ever carry a matching one. `entry.session` is '' rather than absent for that case.
    const comparable = SESSION_KEY.test(session) && SESSION_KEY.test(entry.session)

    if (comparable) {
      if (holders.some((holder) => holder.session === session)) {
        // The connecting device is the one already in the room - re-announcing would just evict
        // its own live participant.
        metrics.increment('dcl_gatekeeper_cluster_reannounce_suppressed_total')
        return
      }

      if (holders.some((holder) => !holder.session || !SESSION_KEY.test(holder.session))) {
        // Missing or malformed attributes are "cannot tell", not "stale": a LiveKit without attribute support, a
        // pre-deploy token, or a genuinely legacy mint all look like this, and evicting on it
        // would kick a live device on every one of its reconnects. Suppress instead of evicting -
        // self-healing the takeover race still works, because a device this gatekeeper actually
        // displaced always carries its own session attribute.
        metrics.increment('dcl_gatekeeper_cluster_reannounce_suppressed_total')
        return
      }
    } else if (holders.length > 0) {
      // Not judgeable, so fall back to the identity-only check this replaced: any holder at all
      // reads as already in, since no holder here could ever carry a session to compare.
      metrics.increment('dcl_gatekeeper_cluster_reannounce_suppressed_total')
      return
    }

    if (holders.length > 0) {
      // Reached only when comparable and every remaining holder carries a different valid
      // session: a displaced device that outlived its eviction (a stale mirror entry, a takeover
      // retry still in flight on another replica, or an unrevoked re-join). Removed by the exact
      // identity LiveKit listed it under, not `wallet` - LiveKit matches identity exactly, and a
      // foreign or legacy mint can be checksum-cased.
      const stamp = new Date(entry.receivedAt)
      const identities = new Set(holders.map((holder) => holder.identity))
      for (const identity of identities) {
        if (!isStillCurrent()) return
        try {
          await livekit.removeParticipant(room, identity, stamp)
        } catch (error) {
          if ((error as { code?: string })?.code !== 'not_found') {
            // Announcing the new session next to a displaced participant that refused to leave
            // is exactly the race this fix closes, so this must not fall through to the mint.
            metrics.increment('dcl_gatekeeper_cluster_reannounce_stale_evict_failed_total')
            logger.warn(
              `Cannot evict stale participant of ${wallet} from ${room}, not re-announcing: ${getErrorMessage(error)}`
            )
            return
          }
          // not_found: already gone - the grouped takeover path, or another replica, beat this one to it.
        }
      }
      metrics.increment('dcl_gatekeeper_cluster_reannounce_evicted_stale_total')
    } else {
      metrics.increment('dcl_gatekeeper_cluster_reannounce_attempted_total')
    }

    // The stale eviction's revocation stamp - this event's receipt second, taken above - lands
    // before this mint, so a token minted here can never be born already-revoked. `receivedAt`
    // is unused when there is nothing displaced here (displacedSession is always '' below).
    await processClusterChange(
      wallet,
      {
        clusterId: entry.clusterId,
        realm: '',
        session: entry.session,
        displacedSession: '',
        displacedClusterId: ''
      },
      Date.now(),
      isStillCurrent
    )
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
    // Captured at delivery, not when this wallet's chain gets around to running the task below -
    // the revocation stamp must be this event's receipt second (F2a), not whenever a backlog
    // clears.
    const receivedAt = Date.now()
    const change = normalizeChange(PeerClusterChange.decode(data))
    metrics.increment('dcl_gatekeeper_cluster_events_received_total')

    // After the received-counter: this is a payload problem, not a decode one. Protobuf
    // decodes a missing cluster_id as '', and unguarded that would dump every such peer into
    // one shared `island-` room.
    if (!change.clusterId) {
      logger.warn(`Cannot process cluster_change for ${wallet}: empty clusterId`)
      return
    }

    void enqueue(wallet, () => processClusterChange(wallet, change, receivedAt)).catch((error) => {
      logger.error(`Cannot process cluster_change for ${wallet}: ${getErrorMessage(error)}`)
    })
  }

  // Appends `session` to `displaced`, moving it to the most-recently-seen end if already
  // present, and drops the oldest entry once the cap is exceeded (F4): a rolling window of the
  // sessions Pulse most recently displaced for a wallet, not a full history.
  function rememberDisplaced(displaced: string[], session: string): void {
    const existingIndex = displaced.indexOf(session)
    if (existingIndex !== -1) {
      displaced.splice(existingIndex, 1)
    }
    displaced.push(session)
    if (displaced.length > MAX_DISPLACED_SESSIONS) {
      displaced.shift()
    }
  }

  function handleAssignmentMirror(wallet: string, data: Uint8Array): void {
    const change = normalizeChange(PeerClusterChange.decode(data))
    const { clusterId, session } = change
    if (!clusterId) {
      return
    }

    const previous = assignmentMirror.get(wallet)
    const displaced = previous?.displaced ? [...previous.displaced] : []

    // The wallet's previous live session becomes displaced the moment a new one takes over, even
    // on an event that itself names no displaced session (F4) - a device still holding it may
    // reconnect later.
    if (previous?.session && SESSION_KEY.test(previous.session) && previous.session !== session) {
      rememberDisplaced(displaced, previous.session)
    }
    if (SESSION_KEY.test(change.displacedSession) && change.displacedSession !== session) {
      rememberDisplaced(displaced, change.displacedSession)
    }

    // B2: the session becoming live now is never "displaced" - it is the one holding the wallet.
    // Without this, a session that was once displaced and later becomes live again (or already
    // sat in the window under a stale entry) would be both the mirror's live session and a member
    // of `displaced` at once, a trap for any future reader of the window.
    const nowLiveIndex = displaced.indexOf(session)
    if (nowLiveIndex !== -1) {
      displaced.splice(nowLiveIndex, 1)
    }

    assignmentMirror.set(wallet, { clusterId, session, receivedAt: Date.now(), displaced })
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
