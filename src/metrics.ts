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
  dcl_gatekeeper_nats_publish_unconfirmed_total: {
    help: 'Confirmed publishes whose broker round trip did not settle within the deadline; the write reached a connected client and is counted as published',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_snapshot_overflow_total: {
    help: 'Snapshot hints deferred to a later Pulse refresh because the recovery backlog is full',
    type: IMetricsComponent.CounterType
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
  dcl_gatekeeper_cluster_access_check_failed_total: {
    help: 'Total cluster_change events let through because the access gate lookup failed (fail-open)',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_connects_received_total: {
    help: 'Total peer connect events received from WS Connector',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_attempted_total: {
    help: 'Total resolved assignments that needed credentials because the participant was absent',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_suppressed_total: {
    help: 'Total resolved assignments skipped because LiveKit already holds the wallet',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_unresolved_total: {
    help: 'Total assignment lookups no Pulse instance answered: nothing is assigned to that wallet under that session (absent, departed or displaced)',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_authority_unavailable_total: {
    help: 'Total assignment lookups that could not reach Pulse: no connection, no responder on the subject, or a failed request',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_authority_request_duration_seconds: {
    help: 'Round-trip time of assignment lookups to Pulse, by outcome',
    type: IMetricsComponent.HistogramType,
    labelNames: ['status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2]
  },
  dcl_gatekeeper_cluster_malformed_session_total: {
    help: 'Total connects and change events dropped because their session is not a session key',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_check_failed_total: {
    help: 'Total resolved assignments skipped because the LiveKit participant lookup failed',
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
  dcl_gatekeeper_cluster_takeover_skipped_total: {
    help: 'Total superseded takeover edges whose displaced session was left in place: it is active again, this replica had since handed its room to a newer session, or this replica has no mint on record for the wallet',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_skipped_other_session_total: {
    help: 'Total assignment lookups skipped because Pulse returned an invalid or mismatched active session',
    type: IMetricsComponent.CounterType
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
