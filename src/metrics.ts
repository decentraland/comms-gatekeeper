import { getDefaultHttpMetrics } from '@dcl/http-server'
import { validateMetricsDeclaration } from '@dcl/metrics'
import { metricDeclarations as logsMetricsDeclarations } from '@well-known-components/logger'
import { IMetricsComponent } from '@well-known-components/interfaces'

export const metricDeclarations = {
  ...getDefaultHttpMetrics(),
  ...logsMetricsDeclarations,
  dcl_gatekeeper_nats_connected: {
    help: '1 when the NATS connection is established, 0 otherwise',
    type: IMetricsComponent.GaugeType
  },
  dcl_gatekeeper_cluster_events_received_total: {
    help: 'Total cluster_change events received from Pulse',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_tokens_minted_total: {
    help: 'Total LiveKit tokens minted for cluster rooms',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_published_total: {
    help: 'Total island_changed messages published',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_publish_failed_total: {
    help: 'Total island_changed publishes that failed',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_banned_skipped_total: {
    help: 'Total cluster_change events skipped because the wallet is banned or denylisted',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_connects_received_total: {
    help: 'Total peer connect events received from WS Connector',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_attempted_total: {
    help: "Total peer connect events that went on to re-announce the wallet's island without evicting a stale participant first (see …evicted_stale_total for the ones that did)",
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_suppressed_total: {
    help: 'Total peer connect events skipped because the room already accounted for the connecting identity: the same session, a session attribute LiveKit could not classify, or sessions that were not comparable at all',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_unresolved_total: {
    help: 'Total peer connect events skipped because no cluster is known for the wallet',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_check_failed_total: {
    help: 'Total peer connect events skipped because the LiveKit participant lookup failed',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_takeover_evicted_total: {
    help: 'Total displaced sessions removed from their island room, with their tokens revoked, before the new session was minted',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_takeover_failed_total: {
    help: 'Total displaced sessions whose LiveKit removal failed after every retry',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_takeover_absent_total: {
    help: 'Total displaced sessions that had already left their island room when the takeover arrived; nothing was removed or revoked',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_skipped_other_session_total: {
    help: 'Total peer connect events skipped because the connecting session is not the one Pulse last published for the wallet',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_presence_batches_received_total: {
    help: 'Total engine.parcel_changes batches received from Pulse',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_presence_snapshots_total: {
    help: 'Total engine.parcel_changes snapshot batches applied',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_presence_gaps_total: {
    help: 'Total engine.parcel_changes sequence gaps detected; the affected server is frozen until its next snapshot',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_presence_contract_violations_total: {
    help: 'Total engine.parcel_changes entries that broke C1 (a non-lowercase realm or address, or a missing address)',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_presence_map_size: {
    help: 'Number of wallets currently held in the presence map',
    type: IMetricsComponent.GaugeType
  },
  dcl_gatekeeper_presence_frozen_servers: {
    help: 'Number of Pulse instances whose deltas are being skipped while waiting for their next snapshot',
    type: IMetricsComponent.GaugeType
  },
  dcl_gatekeeper_presence_reclaimed_total: {
    help:
      'Total presence-map entries reclaimed because nothing stands behind them any more: a primed ' +
      'entry no publisher re-asserted within PRESENCE_PRIME_TTL_MS, or the entries of a publisher ' +
      'silent for PRESENCE_SERVER_TTL_MS',
    type: IMetricsComponent.CounterType,
    labelNames: ['reason']
  },
  dcl_gatekeeper_cluster_reannounce_evicted_stale_total: {
    help: 'Total displaced participants removed from an island room, with their tokens revoked, by a connect re-announce before minting the connecting session',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_stale_evict_failed_total: {
    help: 'Total connect re-announces abandoned because removing a displaced participant from the island room failed',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_takeover_skipped_live_total: {
    help: "Total takeover removals skipped because every holder under the wallet's identity already carried the new session - another replica's connect re-announce had already healed it in (N1)",
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_takeover_parked_total: {
    help: 'Total displaced sessions minted a token into a private parked room and published to, ahead of their eviction and the new session mint (F4)',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_parked_total: {
    help: 'Total peer connect events from a session the mirror remembers as previously displaced for the wallet, parked instead of ignored (F4)',
    type: IMetricsComponent.CounterType
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
