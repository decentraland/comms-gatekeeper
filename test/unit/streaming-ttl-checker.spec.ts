import { createStreamingTTLChecker } from '../../src/adapters/streaming-ttl-checker'
import { CronJob } from 'cron'
import { IBaseComponent } from '@well-known-components/interfaces'
import { IStreamingChecker } from '../../src/types/checker.type'

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
        getExpiredStreamAccesses: jest.fn(),
        killStreaming: jest.fn()
      },
      livekit: {
        removeIngress: jest.fn()
      },
      places: {
        getPlaceStatusById: jest.fn().mockResolvedValue([{ id: 'place1' }, { id: 'place2' }])
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

      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith(
        'Ingress ingress1 revoked correctly from LiveKit and streaming killed'
      )
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith(
        'Ingress ingress2 revoked correctly from LiveKit and streaming killed'
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
