import { createStreamingKeyTTLChecker } from '../../src/adapters/streaming-key-ttl-checker'
import { CronJob } from 'cron'
import { IBaseComponent } from '@well-known-components/interfaces'
import { IStreamingKeyChecker } from '../../src/types/checker.type'

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
  streamingKeyChecker: IStreamingKeyChecker & IBaseComponent,
  startOptions: IBaseComponent.ComponentStartOptions
) => {
  await streamingKeyChecker.start(startOptions)
  const constructorArgs = MockedCronJob.mock.calls[0]
  const onTickFunction = constructorArgs[1] as (() => void | Promise<void>) | undefined
  if (typeof onTickFunction === 'function') {
    await onTickFunction()
  } else {
    throw new Error('onTick function was not passed to CronJob constructor mock')
  }
}

describe('StreamingKeyTTLChecker', () => {
  let streamingKeyChecker: IStreamingKeyChecker & IBaseComponent
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
        removeExpiredStreamingKeys: jest.fn()
      }
    }

    startOptions = {
      started: () => true,
      live: () => true,
      getComponents: () => mockedComponents
    }

    streamingKeyChecker = await createStreamingKeyTTLChecker(mockedComponents)
  })

  describe('start', () => {
    it('should start the cron job', async () => {
      await streamingKeyChecker.start(startOptions)
      const mockJobInstance = MockedCronJob.mock.results[0]?.value
      expect(MockedCronJob).toHaveBeenCalled()
      expect(mockJobInstance?.start).toHaveBeenCalled()
    })

    it('should call removeExpiredStreamingKeys and log success', async () => {
      mockedComponents.sceneStreamAccessManager.removeExpiredStreamingKeys.mockResolvedValue(undefined)
      await executeOnTick(streamingKeyChecker, startOptions)

      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Looking into active streamings.')
      expect(mockedComponents.sceneStreamAccessManager.removeExpiredStreamingKeys).toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      const error = new Error('Test error')
      mockedComponents.sceneStreamAccessManager.removeExpiredStreamingKeys.mockRejectedValue(error)

      await executeOnTick(streamingKeyChecker, startOptions)

      expect(mockedComponents.logs.getLogger().error).toHaveBeenCalledWith(`Error while checking places: ${error}`)
    })
  })

  describe('stop', () => {
    it('should stop the cron job', async () => {
      await streamingKeyChecker.start(startOptions)
      const mockJobInstance = MockedCronJob.mock.results[0]?.value
      await streamingKeyChecker.stop()
      expect(mockJobInstance?.stop).toHaveBeenCalled()
    })
  })
})
