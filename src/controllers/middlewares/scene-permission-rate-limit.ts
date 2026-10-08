import { IHttpServerComponent } from '@dcl/core-commons'
import { LRUCache } from 'lru-cache'
import { AppComponents } from '../../types'

type PermissionMiddlewareContext = IHttpServerComponent.DefaultContext<object> & { verification?: { auth?: string } }
type PermissionMiddleware = (
  ctx: PermissionMiddlewareContext,
  next: () => Promise<IHttpServerComponent.IResponse>
) => Promise<IHttpServerComponent.IResponse>

/**
 * Bounds permission lookup traffic per verified wallet and service instance.
 * Install after signed-fetch authentication and before handlers that contact permission providers.
 * @param components - Configuration for the shared wallet quota.
 * @returns Middleware returning 429 with Retry-After when the quota is exhausted.
 */
export async function createScenePermissionRateLimit({
  config
}: Pick<AppComponents, 'config'>): Promise<PermissionMiddleware> {
  const configuredLimit = await config.getNumber('SCENE_PERMISSION_REQUEST_LIMIT')
  const configuredWindow = await config.getNumber('SCENE_PERMISSION_REQUEST_WINDOW_MS')
  const limit = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 60
  const windowMs = Number.isSafeInteger(configuredWindow) && configuredWindow >= 1000 ? configuredWindow : 60000
  const requests = new LRUCache<string, { count: number; expiresAt: number }>({ max: 10000, ttl: windowMs })

  return async function scenePermissionRateLimit(
    ctx: PermissionMiddlewareContext,
    next: () => Promise<IHttpServerComponent.IResponse>
  ): Promise<IHttpServerComponent.IResponse> {
    const address = ctx.verification?.auth?.toLowerCase()
    if (!address) return { status: 401, body: { error: 'Authentication required' } }
    const now = Date.now()
    let quota = requests.get(address)
    if (!quota || quota.expiresAt <= now) {
      if (requests.size >= requests.max) requests.purgeStale()
      // Do not evict live quotas: rotating wallets must not reset another wallet's limit.
      if (!quota && requests.size >= requests.max) {
        return {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(windowMs / 1000)) },
          body: { error: 'Scene permission request capacity reached' }
        }
      }
      quota = { count: 0, expiresAt: now + windowMs }
      requests.set(address, quota)
    }
    if (quota.count >= limit) {
      return {
        status: 429,
        headers: { 'Retry-After': String(Math.max(1, Math.ceil((quota.expiresAt - now) / 1000))) },
        body: { error: 'Too many scene permission requests' }
      }
    }
    quota.count++
    return next()
  }
}
