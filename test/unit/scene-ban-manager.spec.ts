import { ILoggerComponent } from '@well-known-components/interfaces'
import { createSceneBanManagerComponent } from '../../src/adapters/scene-ban-manager'
import { AddSceneBanInput, AppComponents, ISceneBanManager } from '../../src/types'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { IPgComponent } from '@well-known-components/pg-component'
import { createDatabaseMockedComponent } from '../mocks/database-mock'

describe('SceneBanManager', () => {
  let mockedComponents: jest.Mocked<Pick<AppComponents, 'database' | 'logs'>>
  let sceneBanManager: ISceneBanManager
  let mockedLogger: jest.Mocked<ILoggerComponent>
  let mockedDatabase: jest.Mocked<IPgComponent>

  beforeEach(async () => {
    mockedLogger = createLoggerMockedComponent()
    mockedDatabase = createDatabaseMockedComponent()
    mockedComponents = {
      database: mockedDatabase,
      logs: mockedLogger
    }

    sceneBanManager = await createSceneBanManagerComponent(mockedComponents)
  })

  describe('when adding a ban', () => {
    let sceneBan: AddSceneBanInput

    beforeEach(() => {
      sceneBan = {
        placeId: 'test-place-id',
        bannedAddress: '0x1234567890123456789012345678901234567890',
        bannedBy: '0x0987654321098765432109876543210987654321'
      }
    })

    describe('and database operation fails', () => {
      beforeEach(() => {
        const dbError = new Error('Database connection failed')
        mockedDatabase.query.mockRejectedValue(dbError)
      })

      it('should propagate database errors', async () => {
        await expect(sceneBanManager.addBan(sceneBan)).rejects.toThrow('Database connection failed')
      })
    })
  })
})
