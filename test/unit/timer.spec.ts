import { waitUntil } from '../../src/utils/timer'

describe('when waiting for an admission boundary', () => {
  let lifecycle: AbortController
  let completed: jest.Mock
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(1000)
    lifecycle = new AbortController()
    completed = jest.fn()
  })
  afterEach(() => {
    jest.useRealTimers()
  })
  it('should remain pending until the boundary and clear its timer afterward', async () => {
    const waiting = waitUntil(2000, lifecycle.signal).then(completed)
    await jest.advanceTimersByTimeAsync(999)
    expect(completed).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    await waiting
    expect(completed).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })
  it('should release a pending wait immediately when stopped', async () => {
    const waiting = waitUntil(60_000, lifecycle.signal)
    lifecycle.abort()
    await waiting
    expect(jest.getTimerCount()).toBe(0)
  })
  it('should schedule nothing when already stopped', async () => {
    lifecycle.abort()
    await waitUntil(60_000, lifecycle.signal)
    expect(jest.getTimerCount()).toBe(0)
  })
})
