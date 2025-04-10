import { createPlaceChecker } from '../../src/adapters/places-checker'
import { CronJob, CronOnCompleteCommand } from 'cron'
import { IPlaceChecker } from '../../src/types/places-checker.type'
import { IBaseComponent } from '@well-known-components/interfaces'

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
  placeChecker: IPlaceChecker & IBaseComponent,
  startOptions: IBaseComponent.ComponentStartOptions
) => {
  await placeChecker.start(startOptions)
  const constructorArgs = MockedCronJob.mock.calls[0]
  const onTickFunction = constructorArgs[1] as (() => void | Promise<void>) | undefined
  if (typeof onTickFunction === 'function') {
    await onTickFunction()
  } else {
    throw new Error('onTick function was not passed to CronJob constructor mock')
  }
}

describe('PlaceChecker', () => {
  let placeChecker: IPlaceChecker & IBaseComponent
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
      sceneAdminManager: {
        getPlacesIdWithActiveAdmins: jest.fn(),
        removeAllAdminsByPlaceIds: jest.fn()
      },
      sceneStreamAccessManager: {
        removeAccessByPlaceIds: jest.fn()
      },
      places: {
        getPlaceStatusById: jest.fn()
      }
    }

    startOptions = {
      started: () => true,
      live: () => true,
      getComponents: () => mockedComponents
    }

    placeChecker = await createPlaceChecker(mockedComponents)
  })

  describe('start', () => {
    it('should start the cron job', async () => {
      await placeChecker.start(startOptions)
      const mockJobInstance = MockedCronJob.mock.results[0]?.value
      expect(MockedCronJob).toHaveBeenCalled()
      expect(mockJobInstance?.start).toHaveBeenCalled()
    })

    it('should handle no places with active admins', async () => {
      mockedComponents.sceneAdminManager.getPlacesIdWithActiveAdmins.mockResolvedValue([])
      await executeOnTick(placeChecker, startOptions)
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith('No places with active admins found.')
    })

    it('should handle places with active admins', async () => {
      const mockPlaces = ['place1', 'place2']
      const mockPlaceStatus = [
        { id: 'place1', disabled: false },
        { id: 'place2', disabled: true }
      ]

      mockedComponents.sceneAdminManager.getPlacesIdWithActiveAdmins.mockResolvedValue(mockPlaces)
      mockedComponents.places.getPlaceStatusById.mockResolvedValue(mockPlaceStatus)

      await executeOnTick(placeChecker, startOptions)

      expect(mockedComponents.sceneAdminManager.removeAllAdminsByPlaceIds).toHaveBeenCalledWith(['place2'])
      expect(mockedComponents.sceneStreamAccessManager.removeAccessByPlaceIds).toHaveBeenCalledWith(['place2'])
      expect(mockedComponents.logs.getLogger().info).toHaveBeenCalledWith(
        'All admins and stream access removed for places: place2'
      )
    })

    it('should not remove admins or access when no places are disabled', async () => {
      const mockPlaces = ['place1', 'place2']
      const mockPlaceStatus = [
        { id: 'place1', disabled: false },
        { id: 'place2', disabled: false }
      ]

      mockedComponents.sceneAdminManager.getPlacesIdWithActiveAdmins.mockResolvedValue(mockPlaces)
      mockedComponents.places.getPlaceStatusById.mockResolvedValue(mockPlaceStatus)

      await executeOnTick(placeChecker, startOptions)

      expect(mockedComponents.sceneAdminManager.removeAllAdminsByPlaceIds).not.toHaveBeenCalled()
      expect(mockedComponents.sceneStreamAccessManager.removeAccessByPlaceIds).not.toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      const error = new Error('Test error')
      mockedComponents.sceneAdminManager.getPlacesIdWithActiveAdmins.mockRejectedValue(error)

      await executeOnTick(placeChecker, startOptions)

      expect(mockedComponents.logs.getLogger().error).toHaveBeenCalledWith(`Error while checking places: ${error}`)
    })
  })

  describe('stop', () => {
    it('should stop the cron job', async () => {
      await placeChecker.start(startOptions)
      const mockJobInstance = MockedCronJob.mock.results[0]?.value
      await placeChecker.stop()
      expect(mockJobInstance?.stop).toHaveBeenCalled()
    })
  })
})
