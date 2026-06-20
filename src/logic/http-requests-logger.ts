import type { IHttpServerComponent } from '@dcl/core-commons'
import type { ILoggerComponent } from '@well-known-components/interfaces'

// Paths that should not be logged (health probes), matching the previous
// @well-known-components/http-requests-logger-component defaults.
const SKIP_PATHS = ['/health/live', '/health/ready']

/**
 * Logs every incoming request and its response status on the native @dcl/http-server,
 * replacing @well-known-components/http-requests-logger-component (which is still typed
 * against the node-fetch interfaces server). Format is kept identical:
 * `[METHOD: /path?query#hash]` on the way in and `[METHOD: /path?query#hash][status]` on the way out.
 */
export function instrumentHttpServerWithRequestLogger({
  server,
  logger
}: {
  server: IHttpServerComponent<object>
  logger: ILoggerComponent
}): void {
  const inLogger = logger.getLogger('http-in')
  const outLogger = logger.getLogger('http-out')

  server.use(async (ctx, next) => {
    const label = `[${ctx.request.method}: ${ctx.url.pathname}${ctx.url.search}${ctx.url.hash}]`
    const skip = SKIP_PATHS.includes(ctx.url.pathname)

    if (!skip) {
      inLogger.info(label)
    }

    let status = 200
    try {
      const response = await next()
      status = response.status ?? 200
      return response
    } catch (error) {
      if (typeof error === 'object' && error !== null) {
        if ('status' in error && typeof error.status === 'number') {
          status = error.status
        } else if ('statusCode' in error && typeof error.statusCode === 'number') {
          status = error.statusCode
        }
      }
      throw error
    } finally {
      if (!skip) {
        outLogger.info(`${label}[${status}]`)
      }
    }
  })
}
