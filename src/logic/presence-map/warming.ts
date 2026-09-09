import { IHttpServerComponent } from '@dcl/core-commons'

/**
 * Thrown by a presence route that has nothing to answer with yet, because the presence map has
 * not been primed and no other implementation is allowed to answer for it.
 *
 * It is not a failure: the map primes within seconds of boot (or on the first snapshot, within
 * 60 s at worst). It exists so the caller is told "we do not know yet" instead of being handed
 * an empty list, which reads as "nobody is here" and is a wrong answer rather than a missing one.
 */
export class PresenceMapWarmingError extends Error {
  constructor(message = 'The presence map has not been primed yet') {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * The one warming answer every presence route serves, so `/hot-scenes` and
 * `/scene-participants` cannot drift into two different bodies.
 *
 * @returns `503 {"ok":false,"error":"warming"}`, per contract C3.
 */
export function presenceWarmingResponse(): IHttpServerComponent.IResponse {
  return {
    status: 503,
    body: { ok: false, error: 'warming' }
  }
}
