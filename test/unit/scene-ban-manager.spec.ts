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

  describe('addBan', () => {
    describe('when input is valid', () => {
      const validInput = {
        place_id: 'test-place-id',
        banned_address: '0x1234567890123456789012345678901234567890',
        banned_by: '0x0987654321098765432109876543210987654321'
      }

      describe('and ban is successfully created', () => {
        beforeEach(() => {
          const mockResult = {
            rowCount: 1,
            rows: [
              {
                id: 'test-ban-id',
                place_id: validInput.place_id,
                banned_address: validInput.banned_address.toLowerCase(),
                banned_by: validInput.banned_by.toLowerCase(),
                banned_at: Date.now(),
                active: true
              } as SceneBan
            ]
          }
          mockedDatabase.query.mockResolvedValue(mockResult)
        })

        it('should call database query with correct parameters', async () => {
          await sceneBanManager.addBan(validInput)

          expect(mockedDatabase.query).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining('INSERT INTO scene_bans')]),
              values: expect.arrayContaining([
                validInput.place_id,
                validInput.banned_address.toLowerCase(),
                validInput.banned_by.toLowerCase(),
                expect.any(Number)
              ])
            })
          )
        })
      })

      describe('and ban already exists', () => {
        beforeEach(() => {
          const mockResult = {
            rowCount: 0,
            rows: []
          }
          mockedDatabase.query.mockResolvedValue(mockResult)
        })

        it('should handle duplicate ban gracefully', async () => {
          await sceneBanManager.addBan(validInput)

          expect(mockedDatabase.query).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([
                expect.stringContaining('ON CONFLICT (place_id, banned_address) WHERE active = true')
              ])
            })
          )
        })
      })

      describe('and database operation fails', () => {
        beforeEach(() => {
          const dbError = new Error('Database connection failed')
          mockedDatabase.query.mockRejectedValue(dbError)
        })

        it('should propagate database errors', async () => {
          await expect(sceneBanManager.addBan(validInput)).rejects.toThrow('Database connection failed')
        })
      })

      describe('and addresses need to be converted to lowercase', () => {
        beforeEach(() => {
          const mockResult = {
            rowCount: 1,
            rows: []
          }
          mockedDatabase.query.mockResolvedValue(mockResult)
        })

        it('should convert addresses to lowercase in database query', async () => {
          await sceneBanManager.addBan(validInput)

          expect(mockedDatabase.query).toHaveBeenCalledWith(
            expect.objectContaining({
              values: expect.arrayContaining([
                validInput.place_id,
                validInput.banned_address.toLowerCase(),
                validInput.banned_by.toLowerCase(),
                expect.any(Number)
              ])
            })
          )
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
