import { DecentralandSignatureData, verify } from '@dcl/crypto-middleware'
import { HandlerContextWithPath, AuthData } from '../types'
import { UnauthorizedError } from '../types/errors'
import { PlaceAttributes } from '../types/places.type'
import { NotificationStreamingType } from '../types/notification.type'
import { StreamingMetadata } from '../types/notification.type'

//TODO: inject the URL through definitions
const METADATA_IMAGE_URL = 'https://assets-cdn.decentraland.org/streaming/streaming-notification.png'

export async function oldValidate<T extends string>(
  context: HandlerContextWithPath<'fetch' | 'config', T>
): Promise<Omit<AuthData, 'realm' | 'isWorld'>> {
  const { config, fetch } = context.components
  const baseUrl = (await config.getString('HTTP_BASE_URL')) || `${context.url.protocol}//${context.url.host}`
  const path = new URL(baseUrl + context.url.pathname)
  let verification: DecentralandSignatureData<AuthData>
  try {
    verification = await verify(context.request.method, path.pathname, Object.fromEntries(context.request.headers), {
      fetcher: fetch
    })
  } catch (e) {
    throw new UnauthorizedError('Access denied, invalid signed-fetch request')
  }

  const { sceneId, parcel, realmName, deviceIdentifier } = verification.authMetadata
  if (!realmName) {
    throw new UnauthorizedError('Access denied, invalid signed-fetch request, no realmName')
  }

  // Lowercase so LiveKit participant identities are canonical and case-sensitive
  // ops (removeParticipant, ban lookups) match regardless of client-side casing.
  const identity = verification.auth.toLowerCase()

  return {
    identity,
    sceneId,
    parcel,
    realmName,
    deviceIdentifier
  }
}

export async function validate<T extends string>(
  context: HandlerContextWithPath<'fetch' | 'config', T>
): Promise<Omit<AuthData, 'realmName'>> {
  const { config, fetch } = context.components

  const baseUrl = (await config.getString('HTTP_BASE_URL')) || `${context.url.protocol}//${context.url.host}`
  const path = new URL(baseUrl + context.url.pathname)

  let verification: DecentralandSignatureData<AuthData>

  try {
    verification = await verify(context.request.method, path.pathname, Object.fromEntries(context.request.headers), {
      fetcher: fetch
    })
  } catch (e) {
    throw new UnauthorizedError('Access denied, invalid signed-fetch request')
  }

  const { realm, sceneId, parcel, deviceIdentifier } = verification.authMetadata

  if (!realm) {
    throw new UnauthorizedError('Access denied, invalid signed-fetch request, no realm')
  }

  const identity = verification.auth.toLowerCase()

  return {
    identity,
    sceneId,
    parcel,
    realm,
    isWorld: !!realm.hostname?.includes('worlds-content-server'),
    deviceIdentifier
  }
}

/**
 * Reads the client IP address from the Cloudflare `cf-connecting-ip` header.
 *
 * Trusting this header is only safe because the service runs strictly behind
 * Cloudflare, which sets `cf-connecting-ip` to the real client IP and strips any
 * client-supplied value. If the service were ever reachable without going through
 * Cloudflare, this header could be spoofed.
 *
 * Returns undefined for a missing or empty header so callers never persist an empty
 * string (which would be stored but never match a ban).
 *
 * @param headers - The request headers.
 * @returns The client IP, or undefined when the header is absent or empty.
 */
export function getRequestIp(headers: Headers): string | undefined {
  return headers.get('cf-connecting-ip') || undefined
}

export function ensureSlashAtTheEnd(url: string): string | undefined {
  if (!url) return undefined
  return url.endsWith('/') ? url : `${url}/`
}

export function validateFilters(filters: { admin?: string }): {
  valid: boolean
  error?: string
  value: { admin?: string }
} {
  if (filters.admin !== undefined && typeof filters.admin !== 'string') {
    return {
      valid: false,
      error: 'admin must be a string',
      value: {}
    }
  }

  return {
    valid: true,
    value: {
      admin: filters.admin ? filters.admin.toLowerCase() : undefined
    }
  }
}

export function getExplorerUrl(place: Pick<PlaceAttributes, 'world' | 'world_name' | 'base_position'>): string {
  let customParam: string = `position=${place.base_position}`

  if (place.world) {
    customParam = `realm=${place.world_name}`
  }

  return `https://decentraland.org/jump/?${customParam}`
}

export function getNotificationMetadata(
  type: NotificationStreamingType,
  place: Pick<PlaceAttributes, 'world' | 'world_name' | 'base_position'>
): Omit<StreamingMetadata, 'address'> {
  const metadata = {
    title: '',
    description: '',
    position: place.base_position,
    worldName: place.world_name,
    isWorld: place.world,
    url: getExplorerUrl(place),
    image: METADATA_IMAGE_URL
  }
  switch (type) {
    case NotificationStreamingType.STREAMING_KEY_RESET:
      metadata.title = 'Stream Key Reset'
      metadata.description = `Check the Admin Tools panel at ${place.world ? place.world_name : place.base_position} to get the new key.`
      break
    case NotificationStreamingType.STREAMING_KEY_REVOKE:
      metadata.title = 'Stream Key Deactivated'
      metadata.description = `Check the Admin Tools panel at ${place.world ? place.world_name : place.base_position} if you need a new key.`
      break
    case NotificationStreamingType.STREAMING_KEY_EXPIRED:
      metadata.title = 'Stream Key Expired'
      metadata.description = `Go to the Admin Tools panel at ${place.world ? place.world_name : place.base_position} if you need a new key.`
      break
    case NotificationStreamingType.STREAMING_TIME_EXCEEDED:
      metadata.title = 'Stream Timed Out'
      metadata.description = `Restart your stream in your broadcasting software (e.g. OBS) if you'd like to continue streaming to the scene at ${place.world ? place.world_name : place.base_position}`
      break
    case NotificationStreamingType.STREAMING_PLACE_UPDATED:
      metadata.title = 'Stream Location Altered'
      metadata.description = `If you'd like to stream to ${place.world ? place.world_name : place.base_position} please generate a new stream key from the Admin Tools panel in Decentraland.`
      break
    default:
      throw new Error(`Invalid notification type: ${type}`)
  }
  return metadata
}
