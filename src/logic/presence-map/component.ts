import { ParcelChange, ParcelChangesBatch } from '@dcl/protocol/out-js/decentraland/pulse/pulse_presence.gen'
import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { AppComponents } from '../../types'
import { assertAbsoluteHttpUrl, positiveNumberOr } from '../../utils/config'
import { getErrorMessage } from '../errors'
import { IPresenceMapComponent, ParcelCoord, ParcelPeerCount, PresenceEntry } from './types'

/** The one subject Pulse publishes presence deltas on (contract C1). */
export const PARCEL_CHANGES_SUBJECT = 'engine.parcel_changes'

/**
 * How long an entry that only the boot-time HTTP prime stands behind is trusted for. The prime
 * carries no `server_name`, so nothing else can retire it: a peer who left during the hand-over
 * would otherwise sit in the map for the process's whole life. The default is C1's 60 s snapshot
 * interval plus margin — every publisher that is alive re-asserts its own peers well inside it.
 */
const DEFAULT_PRIME_TTL_MS = 90_000

/**
 * How long a publisher may say nothing before it is presumed gone. C1 guarantees a snapshot every
 * 60 s, so 2.5 intervals of silence means the process is not there any more (a scaled-down
 * replica, or one replaced under a new `server_name`) rather than merely quiet — and its peers
 * logged off with it.
 */
const DEFAULT_SERVER_TTL_MS = 150_000

/** How many times per TTL the reclaim sweep runs, so an expiry is never much overdue. */
const RECLAIM_SWEEPS_PER_TTL = 3

type ServerState = {
  /** Last `seq` accepted from this publisher. */
  lastSeq: number
  /**
   * True once a gap was seen: deltas are skipped and the current state kept until the
   * publisher's next snapshot (C1 guarantees one within 60 s).
   */
  frozen: boolean
  /** When the last batch of any kind was seen from this publisher, for the liveness TTL. */
  lastSeenAt: number
  /**
   * True once this publisher has sent a snapshot, which is the only batch that establishes what
   * it knows. A publisher that opened with a delta is on the books — its silence still has to be
   * timed — but it has told this map nothing, so it cannot be what makes the map answerable.
   */
  hasBaseline: boolean
}

type PeersAllResponse = {
  peers?: Array<{ address?: string; realm?: string; parcel?: [number, number] }>
}

function parcelKey(x: number, y: number): string {
  return `${x},${y}`
}

/**
 * Normalises a `"x,y"` parcel key so scene metadata and feed coordinates index identically.
 *
 * @param raw - The key as written in scene metadata.
 * @returns The canonical key, or `undefined` when the value is not a parcel pair.
 */
function normalizeParcelKey(raw: string): string | undefined {
  const parts = raw.split(',')
  if (parts.length !== 2) {
    return undefined
  }
  const x = Number(parts[0])
  const y = Number(parts[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined
  }
  return parcelKey(x, y)
}

/**
 * Resolves `PULSE_URL` for this boot, refusing to start a map that has nothing to prime from.
 *
 * Required while the map is on, and validated rather than merely present. `.env.default` ships
 * inside the image and is a live config source, so a bare `PULSE_URL=` line resolves to `''` and
 * would satisfy any required-key check — which is why the key is commented out there and why the
 * value is checked here. Either way the operator who half-configured the cutover is told at boot
 * instead of getting a prime that can never work: one warn line per restart and a service that
 * 503s for up to a snapshot interval every time it is deployed.
 *
 * A deployment that leaves the map off must still boot whatever the value is, because nothing
 * reads it there.
 *
 * @param enabled - Whether `PRESENCE_MAP_ENABLED` is on.
 * @param value - The resolved `PULSE_URL`, if any.
 * @returns The URL without trailing slashes, or `undefined` when the map is off and it is unset.
 * @throws When the map is on and the value is missing or is not an absolute `http(s)` URL.
 */
function resolvePulseUrl(enabled: boolean, value: string | undefined): string | undefined {
  if (!enabled) {
    return value?.replace(/\/+$/, '')
  }
  if (value === undefined) {
    throw new Error('Configuration: string PULSE_URL is required when PRESENCE_MAP_ENABLED is "true"')
  }
  return assertAbsoluteHttpUrl('PULSE_URL', value).replace(/\/+$/, '')
}

/**
 * Creates the NATS-fed map of where every online peer stands.
 *
 * It consumes Pulse's `engine.parcel_changes` (contract C1) with **no queue group** — every
 * replica needs the whole map, unlike the cluster subscriber where exactly one replica must
 * handle each event. State is a wallet-keyed map plus a realm/parcel index, and the consumer
 * rule it implements is deliberately conservative: on a sequence gap it keeps serving what it
 * has and waits for the next snapshot rather than dropping the map, because an empty
 * `/hot-scenes` reads as "nobody is online" to every caller downstream.
 *
 * A `parcel`-absent entry on this feed is the peer-disconnect event that
 * `src/adapters/peer-state/` notes the cluster feed does not carry. Once this component is the
 * source of truth for who is online, the island-assignment store can be reclaimed from it
 * instead of by expiry, and `CLUSTER_PEER_STATE_TTL_MS` can shrink from its current hour.
 *
 * Off unless `PRESENCE_MAP_ENABLED` is `'true'` and NATS is configured; when off it subscribes
 * to nothing, primes nothing and never becomes ready, which is byte-identical to not having the
 * component at all. On, it refuses to build without a usable `PULSE_URL` (see `resolvePulseUrl`).
 *
 * Readiness is a statement about now, not about the past: see `isReady`.
 *
 * @param components - The config, logs, metrics, nats and fetch components.
 * @returns The presence map component.
 */
export async function createPresenceMapComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'metrics' | 'nats' | 'fetch'>
): Promise<IPresenceMapComponent> {
  const { config, logs, metrics, nats, fetch } = components
  const logger = logs.getLogger('presence-map')

  const [enabledFlag, pulseUrlSetting, primeTtlSetting, serverTtlSetting] = await Promise.all([
    config.getString('PRESENCE_MAP_ENABLED'),
    config.getString('PULSE_URL'),
    config.getNumber('PRESENCE_PRIME_TTL_MS'),
    config.getNumber('PRESENCE_SERVER_TTL_MS')
  ])

  const enabled = enabledFlag === 'true'
  const pulseUrl = resolvePulseUrl(enabled, pulseUrlSetting)
  const primeTtlMs = positiveNumberOr(primeTtlSetting, DEFAULT_PRIME_TTL_MS)
  const serverTtlMs = positiveNumberOr(serverTtlSetting, DEFAULT_SERVER_TTL_MS)
  const reclaimIntervalMs = Math.max(1_000, Math.floor(Math.min(primeTtlMs, serverTtlMs) / RECLAIM_SWEEPS_PER_TTL))

  const entries = new Map<string, PresenceEntry>()
  /** realm -> parcel key -> addresses standing on it. Derived; rebuilt only through the helpers below. */
  const index = new Map<string, Map<string, Set<string>>>()
  const servers = new Map<string, ServerState>()

  /** When the HTTP prime landed, or `undefined` if it never did. Readiness expires with it. */
  let primedAt: number | undefined
  let snapshotsApplied = 0
  let reclaimTimer: NodeJS.Timeout | undefined

  function reportSize(): void {
    metrics.observe('dcl_gatekeeper_presence_map_size', {}, entries.size)
  }

  function reportFrozen(): void {
    let frozen = 0
    for (const state of servers.values()) {
      if (state.frozen) {
        frozen++
      }
    }
    metrics.observe('dcl_gatekeeper_presence_frozen_servers', {}, frozen)
  }

  function indexAdd(entry: PresenceEntry, address: string): void {
    let realmIndex = index.get(entry.realm)
    if (!realmIndex) {
      realmIndex = new Map()
      index.set(entry.realm, realmIndex)
    }
    const key = parcelKey(entry.parcel[0], entry.parcel[1])
    let addresses = realmIndex.get(key)
    if (!addresses) {
      addresses = new Set()
      realmIndex.set(key, addresses)
    }
    addresses.add(address)
  }

  function indexRemove(entry: PresenceEntry, address: string): void {
    const realmIndex = index.get(entry.realm)
    if (!realmIndex) {
      return
    }
    const key = parcelKey(entry.parcel[0], entry.parcel[1])
    const addresses = realmIndex.get(key)
    if (!addresses) {
      return
    }
    addresses.delete(address)
    // Pruned rather than left empty: Genesis City has ~90k parcels and realms come and go, so
    // an unpruned index would keep growing for the process's whole life.
    if (addresses.size === 0) {
      realmIndex.delete(key)
      if (realmIndex.size === 0) {
        index.delete(entry.realm)
      }
    }
  }

  function removeEntry(address: string): void {
    const entry = entries.get(address)
    if (!entry) {
      return
    }
    entries.delete(address)
    indexRemove(entry, address)
  }

  function upsertEntry(address: string, entry: PresenceEntry): void {
    removeEntry(address)
    entries.set(address, entry)
    indexAdd(entry, address)
  }

  function removeEntriesOwnedBy(serverName: string): number {
    let removed = 0
    for (const [address, entry] of entries) {
      if (entry.serverName === serverName) {
        entries.delete(address)
        indexRemove(entry, address)
        removed++
      }
    }
    return removed
  }

  function applyChange(change: ParcelChange, serverName: string, seq: number): void {
    const rawAddress = change.address
    const rawRealm = change.realm

    if (!rawAddress) {
      metrics.increment('dcl_gatekeeper_presence_contract_violations_total')
      logger.warn(`Discarding a change with no address from ${serverName} (seq ${seq})`)
      return
    }

    if (rawAddress !== rawAddress.toLowerCase() || rawRealm !== rawRealm.toLowerCase()) {
      // Counted and logged without the address or the realm: C1 §5 says both are lowercase, so a
      // non-lowercase value is the publisher's bug, and this consumer normalises rather than
      // dropping state over it. Never a crash, never a reason to discard the batch.
      metrics.increment('dcl_gatekeeper_presence_contract_violations_total')
      logger.warn(`Non-lowercase realm or address on ${PARCEL_CHANGES_SUBJECT} from ${serverName} (seq ${seq})`)
    }

    const address = rawAddress.toLowerCase()

    if (!change.parcel) {
      const existing = entries.get(address)
      // Only the owner may retire an entry — or any publisher, while the entry is still just
      // primed and belongs to nobody. Ordering between two publishers is not guaranteed, so a
      // hand-over — the peer reconnecting to another Pulse — can deliver the old instance's exit
      // after the new instance's placement, and honouring it would drop a peer that is very much
      // online.
      if (existing && existing.serverName !== undefined && existing.serverName !== serverName) {
        return
      }
      removeEntry(address)
      return
    }

    upsertEntry(address, {
      realm: rawRealm.toLowerCase(),
      parcel: [change.parcel.x, change.parcel.y],
      serverName
    })
  }

  function applyBatch(batch: ParcelChangesBatch): void {
    const serverName = batch.serverName
    if (!serverName) {
      // Without it there is nothing to key `seq` or snapshot replacement by, and treating every
      // such batch as one publisher would let two of them overwrite each other's state.
      metrics.increment('dcl_gatekeeper_presence_contract_violations_total')
      logger.warn(`Discarding a ${PARCEL_CHANGES_SUBJECT} batch with no server_name`)
      return
    }

    // Liveness is about the publisher, not about the batch being useful: a duplicate, a gap and a
    // delta skipped while frozen all prove the process is still there.
    const known = servers.get(serverName)
    if (known) {
      known.lastSeenAt = Date.now()
    }

    if (batch.snapshot) {
      // Only this publisher's own entries: `/peers?all=true` is the all-instances list, so the
      // primed entries this snapshot does not mention may well belong to a Pulse whose own
      // snapshot is up to 60 s away. Wiping them here would report an empty Genesis City — the
      // "nobody is here" answer both routes exist never to give. They expire on their own TTL if
      // no publisher ever claims them (see `reclaim`).
      removeEntriesOwnedBy(serverName)

      for (const change of batch.changes) {
        applyChange(change, serverName, batch.seq)
      }

      servers.set(serverName, { lastSeq: batch.seq, frozen: false, lastSeenAt: Date.now(), hasBaseline: true })
      snapshotsApplied++
      metrics.increment('dcl_gatekeeper_presence_snapshots_total')
      reportSize()
      reportFrozen()
      return
    }

    const state = servers.get(serverName)

    if (!state) {
      // First thing heard from this publisher and it is not a snapshot: there is no baseline to
      // apply a delta on top of, so wait for its snapshot instead of inventing one.
      servers.set(serverName, { lastSeq: batch.seq, frozen: true, lastSeenAt: Date.now(), hasBaseline: false })
      metrics.increment('dcl_gatekeeper_presence_gaps_total')
      logger.warn(`First batch from ${serverName} is a delta (seq ${batch.seq}); waiting for its snapshot`)
      reportFrozen()
      return
    }

    if (state.frozen) {
      return
    }

    if (batch.seq <= state.lastSeq) {
      // Already seen. Not a gap: freezing here would stall a healthy publisher until its next
      // snapshot over a duplicate that changes nothing.
      logger.debug(`Ignoring already-applied batch from ${serverName} (seq ${batch.seq} <= ${state.lastSeq})`)
      return
    }

    if (batch.seq !== state.lastSeq + 1) {
      state.frozen = true
      metrics.increment('dcl_gatekeeper_presence_gaps_total')
      logger.warn(
        `Sequence gap on ${serverName}: expected ${state.lastSeq + 1}, got ${batch.seq}. ` +
          'Serving the current map until its next snapshot'
      )
      reportFrozen()
      return
    }

    for (const change of batch.changes) {
      applyChange(change, serverName, batch.seq)
    }
    state.lastSeq = batch.seq
    reportSize()
  }

  function handleParcelChanges(subject: string, data: Uint8Array): void {
    // Kept synchronous and fully guarded: a throw escaping here unwinds into the NATS client's
    // reader loop and stops delivery on every subject on the connection.
    try {
      const batch = ParcelChangesBatch.decode(data)
      metrics.increment('dcl_gatekeeper_presence_batches_received_total')
      applyBatch(batch)
    } catch (error) {
      logger.error(`Cannot process a message on ${subject}: ${getErrorMessage(error)}`)
    }
  }

  async function prime(): Promise<void> {
    if (!pulseUrl) {
      // Unreachable: `PULSE_URL` is required while the map is on, and this only runs then. Kept
      // as the narrowing for the type the config read hands over.
      return
    }

    const url = `${pulseUrl}/peers?all=true`

    try {
      const response = await fetch.fetch(url)
      if (!response.ok) {
        logger.warn(`Priming the presence map from ${url} failed: HTTP ${response.status}`)
        return
      }

      const body = (await response.json()) as PeersAllResponse
      const peers = body?.peers ?? []

      const now = Date.now()

      if (snapshotsApplied > 0) {
        // The feed won the race. Its snapshot is newer and authoritative per publisher, so
        // folding an older HTTP read into it would resurrect peers it just retired.
        logger.info('Discarding the presence-map prime: a snapshot arrived while it was in flight')
        return
      }

      for (const peer of peers) {
        if (!peer?.address || !peer.realm || !Array.isArray(peer.parcel) || peer.parcel.length !== 2) {
          continue
        }
        upsertEntry(peer.address.toLowerCase(), {
          realm: peer.realm.toLowerCase(),
          parcel: [peer.parcel[0], peer.parcel[1]] as ParcelCoord,
          // No `serverName`: this read is the all-instances list and says nothing about which
          // Pulse owns the peer. The first publisher to mention the wallet takes it over.
          primedAt: now
        })
      }

      primedAt = now
      reportSize()
      logger.info(`Primed the presence map with ${peers.length} peers from ${url}`)
    } catch (error) {
      // Never fatal: the next snapshot on the feed makes the map ready anyway, at most 60 s later.
      logger.warn(`Priming the presence map from ${url} failed: ${getErrorMessage(error)}`)
    }
  }

  /**
   * Whether a publisher that has given this map a baseline has been heard from inside its
   * liveness TTL — the same TTL `reclaim` presumes a publisher gone on.
   */
  function hasLiveSource(now: number): boolean {
    for (const state of servers.values()) {
      if (state.hasBaseline && now - state.lastSeenAt < serverTtlMs) {
        return true
      }
    }
    return false
  }

  function isReady(): boolean {
    const now = Date.now()
    // Liveness, not history. A snapshot proves the map held something real *then* and says
    // nothing about now: `reclaim` drops every entry of every publisher that has gone silent for
    // `PRESENCE_SERVER_TTL_MS`, so a NATS restart or a Pulse roll empties the map while the
    // process keeps running. Latching ready on the first snapshot ever applied would then serve
    // "nobody is online" as a fact for as long as the outage lasts — the one answer both routes
    // exist never to give — where 503 warming is the honest "we do not know". The same sweep that
    // empties the map is what un-readies it.
    //
    // The prime is the second half of the same rule and for the same reason: a point-in-time HTTP
    // read with no publisher behind it, trusted only while it is younger than
    // `PRESENCE_PRIME_TTL_MS`.
    return hasLiveSource(now) || (primedAt !== undefined && now - primedAt < primeTtlMs)
  }

  function frozenServers(): string[] {
    const frozen: string[] = []
    for (const [name, state] of servers) {
      if (state.frozen) {
        frozen.push(name)
      }
    }
    return frozen.sort()
  }

  function reclaim(): void {
    const now = Date.now()

    let primeExpired = 0
    for (const [address, entry] of entries) {
      if (entry.serverName === undefined && now - (entry.primedAt ?? 0) >= primeTtlMs) {
        entries.delete(address)
        indexRemove(entry, address)
        primeExpired++
      }
    }

    let serverGone = 0
    for (const [name, state] of servers) {
      if (now - state.lastSeenAt < serverTtlMs) {
        continue
      }
      // Its `seq` goes with it: if the same `server_name` comes back it is a new process, and its
      // first batch must be a snapshot to be applied, exactly as any publisher's first batch is.
      serverGone += removeEntriesOwnedBy(name)
      servers.delete(name)
      logger.warn(`No batch from ${name} for ${serverTtlMs}ms; presuming it gone and dropping its entries`)
    }

    if (primeExpired > 0) {
      metrics.increment('dcl_gatekeeper_presence_reclaimed_total', { reason: 'prime_expired' }, primeExpired)
      logger.info(`Retired ${primeExpired} primed entries no publisher re-asserted within ${primeTtlMs}ms`)
    }
    if (serverGone > 0) {
      metrics.increment('dcl_gatekeeper_presence_reclaimed_total', { reason: 'server_gone' }, serverGone)
    }
    if (primeExpired > 0 || serverGone > 0) {
      reportSize()
      reportFrozen()
    }
  }

  function get(address: string): PresenceEntry | undefined {
    return entries.get(address.toLowerCase())
  }

  function getAddressesInRealm(realm: string): string[] {
    const realmIndex = index.get(realm.toLowerCase())
    if (!realmIndex) {
      return []
    }
    const addresses: string[] = []
    for (const parcelAddresses of realmIndex.values()) {
      addresses.push(...parcelAddresses)
    }
    return addresses.sort()
  }

  function getAddressesInParcels(realm: string, parcels: string[]): string[] {
    const realmIndex = index.get(realm.toLowerCase())
    if (!realmIndex) {
      return []
    }
    // A set, not an array: a scene can list the same parcel twice, and a wallet must not be
    // reported twice for it.
    const addresses = new Set<string>()
    for (const parcel of parcels) {
      const key = normalizeParcelKey(parcel)
      if (!key) {
        continue
      }
      for (const address of realmIndex.get(key) ?? []) {
        addresses.add(address)
      }
    }
    return [...addresses].sort()
  }

  function getParcelCounts(realm: string): ParcelPeerCount[] {
    const realmIndex = index.get(realm.toLowerCase())
    if (!realmIndex) {
      return []
    }
    const counts: ParcelPeerCount[] = []
    for (const [key, addresses] of realmIndex) {
      const [x, y] = key.split(',')
      counts.push({ parcel: [Number(x), Number(y)], peersCount: addresses.size })
    }
    return counts
  }

  async function start(): Promise<void> {
    if (!enabled) {
      logger.info('Presence map is disabled (PRESENCE_MAP_ENABLED is not "true")')
      return
    }
    if (!nats.isEnabled()) {
      logger.info('Presence map is enabled but NATS is not configured, staying idle')
      return
    }

    // No queue group, unlike the cluster subscriber: every replica answers /hot-scenes and
    // /scene-participants from its own copy, so every replica needs every batch.
    nats.subscribe(PARCEL_CHANGES_SUBJECT, handleParcelChanges)

    // Not awaited, for the same reason the cluster subscriber does not await it: connect() can
    // stall ~20 s per unreachable broker address and gates HTTP readiness if awaited, while it
    // never throws and retries in the background regardless.
    void nats.connect()

    // Not awaited either: the prime is what lets the service answer instead of 503-ing for up to
    // a snapshot interval, but Pulse being slow must not hold HTTP readiness. It never throws,
    // and the first snapshot makes the map ready regardless.
    void prime()

    // Nothing else reclaims: a publisher that disappears sends no exits, and a primed entry has
    // no publisher to retire it, so both are swept on a timer rather than on traffic.
    reclaimTimer = setInterval(reclaim, reclaimIntervalMs)
    reclaimTimer.unref?.()

    logger.info(
      `Presence map started, subscribed to ${PARCEL_CHANGES_SUBJECT} (reclaiming every ${reclaimIntervalMs}ms)`
    )
  }

  async function stop(): Promise<void> {
    if (reclaimTimer) {
      clearInterval(reclaimTimer)
      reclaimTimer = undefined
    }
  }

  function size(): number {
    return entries.size
  }

  return {
    isReady,
    size,
    applyBatch,
    get,
    getAddressesInRealm,
    getAddressesInParcels,
    getParcelCounts,
    frozenServers,
    reclaim,
    [START_COMPONENT]: start,
    [STOP_COMPONENT]: stop
  }
}
