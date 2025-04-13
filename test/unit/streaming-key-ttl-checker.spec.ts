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
        getActiveStreamingKeys: jest.fn(),
        removeAccess: jest.fn()
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

    it('should handle no active streaming keys', async () => {
      mockedComponents.sceneStreamAccessManager.getActiveStreamingKeys.mockResolvedValue([])
      await executeOnTick(streamingKeyChecker, startOptions)
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Looking into active streamings.')
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Found 0 active streamings to verify.')
    })

    it('should handle active streaming keys that have not expired', async () => {
      const now = Date.now()
      const mockStreamings = [
        { place_id: 'place1', created_at: now - 1000 * 60 * 60 * 24, streaming: false }, // 1 day old
        { place_id: 'place2', created_at: now - 1000 * 60 * 60 * 24 * 2, streaming: false } // 2 days old
      ]

      mockedComponents.sceneStreamAccessManager.getActiveStreamingKeys.mockResolvedValue(mockStreamings)
      await executeOnTick(streamingKeyChecker, startOptions)

      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Looking into active streamings.')
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Found 2 active streamings to verify.')
      expect(mockedComponents.sceneStreamAccessManager.removeAccess).not.toHaveBeenCalled()
    })

    it('should handle expired streaming keys that are not active', async () => {
      const now = Date.now()
      const mockStreamings = [
        { place_id: 'place1', created_at: now - 1000 * 60 * 60 * 24 * 5, streaming: false }, // 5 days old
        { place_id: 'place2', created_at: now - 1000 * 60 * 60 * 24 * 6, streaming: false } // 6 days old
      ]

      mockedComponents.sceneStreamAccessManager.getActiveStreamingKeys.mockResolvedValue(mockStreamings)
      await executeOnTick(streamingKeyChecker, startOptions)

      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Looking into active streamings.')
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Found 2 active streamings to verify.')
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith(
        'Found 2 streaming keys that exceed the maximum allowed time.'
      )

      expect(mockedComponents.sceneStreamAccessManager.removeAccess).toHaveBeenCalledTimes(2)
      expect(mockedComponents.sceneStreamAccessManager.removeAccess).toHaveBeenCalledWith('place1')
      expect(mockedComponents.sceneStreamAccessManager.removeAccess).toHaveBeenCalledWith('place2')
    })

    it('should not remove access for expired streaming keys that are active', async () => {
      const now = Date.now()
      const mockStreamings = [
        { place_id: 'place1', created_at: now - 1000 * 60 * 60 * 24 * 5, streaming: true }, // 5 days old and active
        { place_id: 'place2', created_at: now - 1000 * 60 * 60 * 24 * 6, streaming: false } // 6 days old and not active
      ]

      mockedComponents.sceneStreamAccessManager.getActiveStreamingKeys.mockResolvedValue(mockStreamings)
      await executeOnTick(streamingKeyChecker, startOptions)

      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Looking into active streamings.')
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('Found 2 active streamings to verify.')
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith(
        'Found 2 streaming keys that exceed the maximum allowed time.'
      )
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith(
        'There are 1 streamings that are active and will not be revoked.'
      )

      expect(mockedComponents.sceneStreamAccessManager.removeAccess).toHaveBeenCalledTimes(1)
      expect(mockedComponents.sceneStreamAccessManager.removeAccess).toHaveBeenCalledWith('place2')
    })

    it('should handle errors gracefully', async () => {
      const error = new Error('Test error')
      mockedComponents.sceneStreamAccessManager.getActiveStreamingKeys.mockRejectedValue(error)

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
