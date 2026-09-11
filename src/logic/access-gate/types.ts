import { ConnectionBanQuery } from '../user-moderation/types'

export type AccessState = {
  /** The address (or its recorded device) has an active platform ban. */
  isBanned: boolean
  /** The address is on the deny list. */
  isDenylisted: boolean
}

export type AccessGateOptions = {
  /**
   * When set, a failing ban lookup is logged and reported as "not banned" instead of
   * propagating. The deny-list result is unaffected and still propagates on failure, so a
   * ban-store outage cannot silently drop deny-list enforcement along with it.
   */
  failOpenOnBanLookupError?: boolean
}

export type IAccessGateComponent = {
  /**
   * Resolves both platform-access gates for an identity, concurrently.
   *
   * Lookup only: it applies no precedence between the two flags and maps nothing to a status
   * code, so callers keep their own ordering and their own error responses.
   *
   * @param query - The address, plus the device id to widen the ban check to when known.
   * @param options - Per-caller fail-open behaviour; both gates propagate errors by default.
   * @returns Both gate results.
   * @throws Whatever the underlying lookups throw, unless suppressed via `options`.
   */
  getAccessState(query: ConnectionBanQuery, options?: AccessGateOptions): Promise<AccessState>
}
