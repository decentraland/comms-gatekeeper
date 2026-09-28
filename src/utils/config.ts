/**
 * Resolves a configured cache bound, rejecting values that are not usable as one.
 *
 * `??` alone is not enough: it lets `0` through, and lru-cache accepts it silently rather than
 * rejecting it — `max: 0` means "unbounded" and `ttl: 0` means "never expires", so a zero
 * meant as "disable this" quietly removes the bound instead of tightening it. Negative values
 * are rejected for the same reason.
 *
 * @param value - The configured value, if any.
 * @param fallback - The default to use when the value is absent or not a usable bound.
 * @returns `value` when it is a positive finite number, `fallback` otherwise.
 */
export function positiveNumberOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * Resolves a configured count, rejecting anything that is not a positive safe integer: a fraction,
 * a non-finite value or a negative one makes a concurrency bound or a backlog size meaningless.
 *
 * @param value - The configured value, if any.
 * @param fallback - The default to use when the value is absent or not a usable count.
 * @returns `value` when it is a positive safe integer, `fallback` otherwise.
 */
export function positiveIntegerOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback
}
