import { createSceneBanManagerComponent } from '../../src/adapters/scene-ban-manager'
import { SceneBan } from '../../src/types'

describe('SceneBanManager', () => {
  let mockedComponents: any
  let sceneBanManager: any

  beforeEach(async () => {
    mockedComponents = {
      database: {
        query: jest.fn()
      },
      logs: {
        getLogger: jest.fn().mockReturnValue({
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn()
        })
      }
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
          mockedComponents.database.query.mockResolvedValue(mockResult)
        })

        it('should call database query with correct parameters', async () => {
          await sceneBanManager.addBan(validInput)

          expect(mockedComponents.database.query).toHaveBeenCalledWith(
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
          mockedComponents.database.query.mockResolvedValue(mockResult)
        })

        it('should handle duplicate ban gracefully', async () => {
          await sceneBanManager.addBan(validInput)

          expect(mockedComponents.database.query).toHaveBeenCalledWith(
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
          mockedComponents.database.query.mockRejectedValue(dbError)
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
          mockedComponents.database.query.mockResolvedValue(mockResult)
        })

        it('should convert addresses to lowercase in database query', async () => {
          await sceneBanManager.addBan(validInput)

          expect(mockedComponents.database.query).toHaveBeenCalledWith(
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
      describe('and place_id is missing', () => {
        const invalidInput = {
          banned_address: '0x1234567890123456789012345678901234567890',
          banned_by: '0x0987654321098765432109876543210987654321'
        }

        it('should throw validation error', async () => {
          await expect(sceneBanManager.addBan(invalidInput)).rejects.toThrow(
            'place_id is required and must be a string'
          )
        })
      })

      describe('and banned_address is missing', () => {
        const invalidInput = {
          place_id: 'test-place-id',
          banned_by: '0x0987654321098765432109876543210987654321'
        }

        it('should throw validation error', async () => {
          await expect(sceneBanManager.addBan(invalidInput)).rejects.toThrow(
            'banned_address is required and must be a string'
          )
        })
      })

      describe('and banned_by is missing', () => {
        const invalidInput = {
          place_id: 'test-place-id',
          banned_address: '0x1234567890123456789012345678901234567890'
        }

        it('should throw validation error', async () => {
          await expect(sceneBanManager.addBan(invalidInput)).rejects.toThrow(
            'banned_by is required and must be a string'
          )
        })
      })

      describe('and input is not an object', () => {
        it('should throw validation error for string input', async () => {
          await expect(sceneBanManager.addBan('invalid')).rejects.toThrow('Input must be an object')
        })

        it('should throw validation error for null input', async () => {
          await expect(sceneBanManager.addBan(null)).rejects.toThrow('Input must be an object')
        })

        it('should throw validation error for undefined input', async () => {
          await expect(sceneBanManager.addBan(undefined)).rejects.toThrow('Input must be an object')
        })
      })
    })
  })
})
