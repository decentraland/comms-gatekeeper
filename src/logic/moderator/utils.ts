import { timingSafeEqual } from 'node:crypto'

const MAX_MODERATOR_NAME_LENGTH = 100
const MODERATOR_NAME_PATTERN = /^[a-zA-Z0-9 _\-.]+$/

export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export function sanitizeModeratorName(name: string): string | null {
  const trimmed = name.trim()

  if (trimmed.length === 0 || trimmed.length > MAX_MODERATOR_NAME_LENGTH) {
    return null
  }

  if (!MODERATOR_NAME_PATTERN.test(trimmed)) {
    return null
  }

  return trimmed
}
