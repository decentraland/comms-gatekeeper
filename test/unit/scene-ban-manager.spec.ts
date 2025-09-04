import { ILoggerComponent } from '@well-known-components/interfaces'
import { createSceneBanManagerComponent } from '../../src/adapters/scene-ban-manager'
import { AddSceneBanInput, AppComponents, ISceneBanManager, SceneBan } from '../../src/types'
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
    describe('when input is valid', () => {
      const validInput = {
        place_id: 'test-place-id',
        banned_address: '0x1234567890123456789012345678901234567890',
        banned_by: '0x0987654321098765432109876543210987654321'
      }

      describe('and database operation fails', () => {
        beforeEach(() => {
          const dbError = new Error('Database connection failed')
          mockedDatabase.query.mockRejectedValue(dbError)
        })

        it('should propagate database errors', async () => {
          await expect(sceneBanManager.addBan(validInput)).rejects.toThrow('Database connection failed')
        })
      })
    })

    describe('when input is invalid', () => {
      let invalidInput: AddSceneBanInput

      describe('and place_id is missing', () => {
        beforeEach(() => {
          invalidInput = {
            banned_address: '0x1234567890123456789012345678901234567890',
            banned_by: '0x0987654321098765432109876543210987654321',
            place_id: undefined
          }
        })

        it('should throw validation error', async () => {
          await expect(sceneBanManager.addBan(invalidInput)).rejects.toThrow(
            'place_id is required and must be a string'
          )
        })
      })

      describe('and banned_address is missing', () => {
        beforeEach(() => {
          invalidInput = {
            place_id: 'test-place-id',
            banned_by: '0x0987654321098765432109876543210987654321',
            banned_address: undefined
          }
        })

        it('should throw validation error', async () => {
          await expect(sceneBanManager.addBan(invalidInput)).rejects.toThrow(
            'banned_address is required and must be a string'
          )
        })
      })

      describe('and banned_by is missing', () => {
        beforeEach(() => {
          invalidInput = {
            place_id: 'test-place-id',
            banned_address: '0x1234567890123456789012345678901234567890',
            banned_by: undefined
          }
        })

        it('should throw validation error', async () => {
          await expect(sceneBanManager.addBan(invalidInput)).rejects.toThrow(
            'banned_by is required and must be a string'
          )
        })
      })

      describe.each(['string', null, undefined])('and input is %s', (input) => {
        beforeEach(() => {
          invalidInput = input as unknown as AddSceneBanInput
        })

        it('should throw validation error', async () => {
          await expect(sceneBanManager.addBan(invalidInput)).rejects.toThrow('Input must be an object')
        })
      })
    })
  })
})
