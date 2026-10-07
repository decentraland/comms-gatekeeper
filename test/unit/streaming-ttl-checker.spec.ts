import { StreamingStateSnapshot } from '../../src/types'
import { createStreamingTTLChecker } from '../../src/adapters/streaming-ttl-checker'
import { CronJob } from 'cron'
import { IBaseComponent } from '@well-known-components/interfaces'
import { IStreamingChecker } from '../../src/types/checker.type'
import { NotificationStreamingType } from '../../src/types/notification.type'

jest.mock('cron', () => ({
  CronJob: jest.fn().mockImplementation((cronTime, onTick, onComplete, start, timeZone) => {
    return {
      start: jest.fn(),
      stop: jest.fn()
    }
  })
}))

const MockedCronJob = CronJob as jest.MockedClass<typeof CronJob>

const executeOnTick = async (
  streamingChecker: IStreamingChecker & IBaseComponent,
  startOptions: IBaseComponent.ComponentStartOptions
) => {
  await streamingChecker.start(startOptions)
  const constructorArgs = MockedCronJob.mock.calls[0]
  const onTickFunction = constructorArgs[1] as (() => void | Promise<void>) | undefined
  if (typeof onTickFunction === 'function') {
    await onTickFunction()
  } else {
    throw new Error('onTick function was not passed to CronJob constructor mock')
  }
}

describe('StreamingTTLChecker', () => {
  let streamingChecker: IStreamingChecker & IBaseComponent
  let mockedComponents: any
  let startOptions: IBaseComponent.ComponentStartOptions

  beforeEach(async () => {
    MockedCronJob.mockClear()

    mockedComponents = {
      logs: {
        getLogger: jest.fn().mockReturnValue({
          info: jest.fn(),
          error: jest.fn()
        })
      },
      sceneStreamAccessManager: {
        getStreamingAccessesToReconcile: jest.fn().mockResolvedValue([]),
        clearStaleStreamingState: jest.fn(),
        getExpiredStreamAccesses: jest.fn(),
        killStreaming: jest.fn(),
        removeAccess: jest.fn()
      },
      livekit: {
        isIngressStreaming: jest.fn(),
        removeIngress: jest.fn()
      },
      places: {
        getPlaceStatusByIds: jest.fn().mockResolvedValue([{ id: 'place1' }, { id: 'place2' }])
      },
      notifications: {
        sendNotificationType: jest.fn()
      }
    }

    startOptions = {
      started: () => true,
      live: () => true,
      getComponents: () => mockedComponents
    }

    streamingChecker = await createStreamingTTLChecker(mockedComponents)
  })

  describe('when reconciling old streaming flags', () => {
    let snapshot: StreamingStateSnapshot

    beforeEach(() => {
      snapshot = { id: 'access', ingress_id: 'ingress', streaming_start_time: '1000', streaming_state_version: '1' }
      mockedComponents.sceneStreamAccessManager.getStreamingAccessesToReconcile.mockResolvedValueOnce([snapshot])
      mockedComponents.sceneStreamAccessManager.getExpiredStreamAccesses.mockResolvedValueOnce([])
    })

    describe('and LiveKit confirms the ingress has stopped', () => {
      beforeEach(() => {
        mockedComponents.livekit.isIngressStreaming.mockResolvedValueOnce(false)
        mockedComponents.sceneStreamAccessManager.clearStaleStreamingState.mockResolvedValueOnce(true)
      })

      it('should conditionally clear the snapshot without deleting its ingress', async () => {
        await executeOnTick(streamingChecker, startOptions)
        expect(mockedComponents.sceneStreamAccessManager.clearStaleStreamingState).toHaveBeenCalledWith(snapshot)
        expect(mockedComponents.livekit.removeIngress).not.toHaveBeenCalled()
      })
    })

    describe.each([true, undefined])('and LiveKit state is active or unknown (%s)', (state) => {
      beforeEach(() => {
        mockedComponents.livekit.isIngressStreaming.mockResolvedValueOnce(state)
      })

      it('should leave the streaming flag untouched', async () => {
        await executeOnTick(streamingChecker, startOptions)
        expect(mockedComponents.sceneStreamAccessManager.clearStaleStreamingState).not.toHaveBeenCalled()
      })
    })

    describe('and LiveKit is unavailable', () => {
      beforeEach(() => {
        mockedComponents.livekit.isIngressStreaming.mockRejectedValueOnce(new Error('unavailable'))
      })

      it('should preserve the flag and continue the existing TTL check', async () => {
        await executeOnTick(streamingChecker, startOptions)
        expect(mockedComponents.sceneStreamAccessManager.clearStaleStreamingState).not.toHaveBeenCalled()
        expect(mockedComponents.sceneStreamAccessManager.getExpiredStreamAccesses).toHaveBeenCalled()
      })
    })
  })

  describe('when selecting reconciliation candidates fails', () => {
    beforeEach(() => {
      mockedComponents.sceneStreamAccessManager.getStreamingAccessesToReconcile.mockRejectedValueOnce(
        new Error('database unavailable')
      )
      mockedComponents.sceneStreamAccessManager.getExpiredStreamAccesses.mockResolvedValueOnce([])
    })

    it('should continue the existing TTL check', async () => {
      await executeOnTick(streamingChecker, startOptions)
      expect(mockedComponents.sceneStreamAccessManager.getExpiredStreamAccesses).toHaveBeenCalled()
    })
  })

  describe('when a streaming limit and reconciliation are both due', () => {
    beforeEach(() => {
      mockedComponents.sceneStreamAccessManager.getExpiredStreamAccesses.mockResolvedValueOnce([
        { ingress_id: 'expired', place_id: 'place1', streaming_start_time: '1000' }
      ])
    })

    it('should enforce the streaming limit before selecting reconciliation work', async () => {
      await executeOnTick(streamingChecker, startOptions)
      expect(mockedComponents.sceneStreamAccessManager.killStreaming.mock.invocationCallOrder[0]).toBeLessThan(
        mockedComponents.sceneStreamAccessManager.getStreamingAccessesToReconcile.mock.invocationCallOrder[0]
      )
    })
  })

  describe('when a reconciliation batch has more than five entries', () => {
    let releases: Array<() => void>
    let active: number
    let maximumActive: number
    let run: Promise<void>

    beforeEach(() => {
      releases = []
      active = 0
      maximumActive = 0
      mockedComponents.sceneStreamAccessManager.getExpiredStreamAccesses.mockResolvedValueOnce([])
      mockedComponents.sceneStreamAccessManager.getStreamingAccessesToReconcile.mockResolvedValueOnce(
        Array.from({ length: 12 }, (_, index) => ({
          id: String(index),
          ingress_id: 'ingress-' + index,
          streaming_start_time: '1000',
          streaming_state_version: '1'
        }))
      )
      mockedComponents.livekit.isIngressStreaming.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            active++
            maximumActive = Math.max(maximumActive, active)
            releases.push(() => {
              active--
              resolve(true)
            })
          })
      )
    })

    afterEach(async () => {
      mockedComponents.livekit.isIngressStreaming.mockResolvedValue(true)
      releases.splice(0).forEach((release) => release())
      await run
    })

    it('should wait for each group before starting more than five requests', async () => {
      run = executeOnTick(streamingChecker, startOptions)
      await new Promise(setImmediate)
      expect(mockedComponents.livekit.isIngressStreaming).toHaveBeenCalledTimes(5)
      releases.splice(0).forEach((release) => release())
      await new Promise(setImmediate)
      expect(mockedComponents.livekit.isIngressStreaming).toHaveBeenCalledTimes(10)
      releases.splice(0).forEach((release) => release())
      await new Promise(setImmediate)
      expect(mockedComponents.livekit.isIngressStreaming).toHaveBeenCalledTimes(12)
      releases.splice(0).forEach((release) => release())
      await run
      expect(maximumActive).toBe(5)
    })
  })

  describe('start', () => {
    it('should start the cron job', async () => {
      await streamingChecker.start(startOptions)
      const mockJobInstance = MockedCronJob.mock.results[0]?.value
      expect(MockedCronJob).toHaveBeenCalled()
      expect(mockJobInstance?.start).toHaveBeenCalled()
    })

    it('should handle no active streamings', async () => {
      mockedComponents.sceneStreamAccessManager.getExpiredStreamAccesses.mockResolvedValue([])
      await executeOnTick(streamingChecker, startOptions)
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Looking into active streamings.')
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Found 0 active streamings to verify.')
    })

    it('should handle active streamings that have not expired', async () => {
      const now = Date.now()
      const mockStreamings = [
        { ingress_id: 'ingress1', created_at: now - 1000 * 60 * 60, place_id: 'place1' }, // 1 hour old
        { ingress_id: 'ingress2', created_at: now - 1000 * 60 * 60 * 2, place_id: 'place2' } // 2 hours old
      ]

      mockedComponents.sceneStreamAccessManager.getExpiredStreamAccesses.mockResolvedValue([])
      await executeOnTick(streamingChecker, startOptions)

      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Looking into active streamings.')
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Found 0 active streamings to verify.')
      expect(mockedComponents.livekit.removeIngress).toHaveBeenCalledTimes(0)
      expect(mockedComponents.sceneStreamAccessManager.killStreaming).toHaveBeenCalledTimes(0)
      expect(mockedComponents.notifications.sendNotificationType).toHaveBeenCalledTimes(0)
    })

    it('should handle expired streamings', async () => {
      const now = Date.now()
      const mockStreamings = [
        { ingress_id: 'ingress1', created_at: now - 1000 * 60 * 60 * 5, place_id: 'place1' }, // 5 hours old
        { ingress_id: 'ingress2', created_at: now - 1000 * 60 * 60 * 6, place_id: 'place2' } // 6 hours old
      ]

      mockedComponents.sceneStreamAccessManager.getExpiredStreamAccesses.mockResolvedValue(mockStreamings)
      await executeOnTick(streamingChecker, startOptions)

      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Looking into active streamings.')
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Found 2 active streamings to verify.')
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith(
        'Found 2 streamings that exceed the maximum allowed time.'
      )

      expect(mockedComponents.livekit.removeIngress).toHaveBeenCalledTimes(2)
      expect(mockedComponents.livekit.removeIngress).toHaveBeenCalledWith('ingress1')
      expect(mockedComponents.livekit.removeIngress).toHaveBeenCalledWith('ingress2')

      expect(mockedComponents.sceneStreamAccessManager.killStreaming).toHaveBeenCalledTimes(2)
      expect(mockedComponents.sceneStreamAccessManager.killStreaming).toHaveBeenCalledWith('ingress1')
      expect(mockedComponents.sceneStreamAccessManager.killStreaming).toHaveBeenCalledWith('ingress2')

      expect(mockedComponents.notifications.sendNotificationType).toHaveBeenCalledTimes(2)
      expect(mockedComponents.notifications.sendNotificationType).toHaveBeenCalledWith(
        NotificationStreamingType.STREAMING_TIME_EXCEEDED,
        { id: 'place1' }
      )
      expect(mockedComponents.notifications.sendNotificationType).toHaveBeenCalledWith(
        NotificationStreamingType.STREAMING_TIME_EXCEEDED,
        { id: 'place2' }
      )

      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith(
        'Streaming killed for place place1 (ingress ingress1 revoked)'
      )
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith(
        'Streaming killed for place place2 (ingress ingress2 revoked)'
      )
    })

    it('should deactivate an expired streaming with an empty ingress id by place, without calling removeIngress/killStreaming', async () => {
      const now = Date.now()
      // A row with no ingress id (killStreaming is guarded against '') must not loop forever.
      mockedComponents.sceneStreamAccessManager.getExpiredStreamAccesses.mockResolvedValue([
        { ingress_id: '', created_at: now - 1000 * 60 * 60 * 5, place_id: 'place1' }
      ])

      await executeOnTick(streamingChecker, startOptions)

      expect(mockedComponents.sceneStreamAccessManager.removeAccess).toHaveBeenCalledWith('place1')
      expect(mockedComponents.livekit.removeIngress).not.toHaveBeenCalled()
      expect(mockedComponents.sceneStreamAccessManager.killStreaming).not.toHaveBeenCalled()
      expect(mockedComponents.notifications.sendNotificationType).toHaveBeenCalledWith(
        NotificationStreamingType.STREAMING_TIME_EXCEEDED,
        { id: 'place1' }
      )
    })

    it('should handle errors gracefully', async () => {
      const error = new Error('Test error')
      mockedComponents.sceneStreamAccessManager.getExpiredStreamAccesses.mockRejectedValue(error)

      await executeOnTick(streamingChecker, startOptions)

      expect(mockedComponents.logs.getLogger().error).toHaveBeenCalledWith(`Error while checking places: ${error}`)
    })
  })

  describe('stop', () => {
    it('should stop the cron job', async () => {
      await streamingChecker.start(startOptions)
      const mockJobInstance = MockedCronJob.mock.results[0]?.value
      await streamingChecker.stop()
      expect(mockJobInstance?.stop).toHaveBeenCalled()
    })
  })
})
