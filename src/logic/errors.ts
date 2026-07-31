export function isErrorWithMessage(error: unknown): error is Error {
  return error !== undefined && error !== null && typeof error === 'object' && 'message' in error
}

/**
 * Narrows an unknown caught value to a loggable message.
 *
 * @param error - The value caught in a `catch` block.
 * @returns The error's `message` when it has one, `'Unknown error'` otherwise.
 */
export function getErrorMessage(error: unknown): string {
  return isErrorWithMessage(error) ? error.message : 'Unknown error'
}
