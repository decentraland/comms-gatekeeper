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
 * @returns `value` when it is a positive number, `fallback` otherwise.
 */
export function positiveNumberOr(value: number | undefined, fallback: number): number {
  return value !== undefined && value > 0 ? value : fallback
}

/**
 * Asserts that a configured value is an absolute `http(s)` URL, and returns it.
 *
 * Presence of the key is not enough. `.env.default` ships inside the image and is a live config
 * source (`src/components.ts` loads `['.env.default', '.env']`), so a placeholder — or an
 * operator's empty string, or a bare hostname — satisfies even `requireString`: `PULSE_URL=`
 * alone resolves to `''`, which the provider returns rather than rejecting. Validating the
 * resolved value is what turns such a misconfiguration into a boot failure instead of a URL that
 * can never be fetched.
 *
 * The value itself is never put in the message: a configured URL is not this service's to print.
 *
 * @param key - The config key, for the error message.
 * @param value - The resolved value.
 * @returns `value`, when it is an absolute `http(s)` URL.
 * @throws When it is anything else, including the empty string.
 */
export function assertAbsoluteHttpUrl(key: string, value: string): string {
  let protocol: string

  try {
    protocol = new URL(value).protocol
  } catch {
    throw new Error(`Configuration: ${key} must be an absolute http(s) URL`)
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Configuration: ${key} must be an absolute http(s) URL`)
  }

  return value
}
