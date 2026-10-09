export async function sleep(ms: number) {
  return new Promise<void>((ok) => setTimeout(ok, ms))
}

/** Wait for a wall-clock boundary, releasing the timer when lifecycle cancellation wins. */
export async function waitUntil(timestamp: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    function finish() {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, Math.max(0, timestamp - Date.now()))
    signal.addEventListener('abort', finish, { once: true })
  })
}
