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
    it('should successfully add a new ban', async () => {
      const input = {
        place_id: 'test-place-id',
        banned_address: '0x1234567890123456789012345678901234567890',
        banned_by: '0x0987654321098765432109876543210987654321'
      }

      const mockResult = {
        rowCount: 1,
        rows: [
          {
            id: 'test-ban-id',
            place_id: input.place_id,
            banned_address: input.banned_address.toLowerCase(),
            banned_by: input.banned_by.toLowerCase(),
            banned_at: Date.now(),
            active: true
          } as SceneBan
        ]
      }

      mockedComponents.database.query.mockResolvedValue(mockResult)

      await sceneBanManager.addBan(input)

      expect(mockedComponents.database.query).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining('INSERT INTO scene_bans')]),
          values: expect.arrayContaining([
            input.place_id,
            input.banned_address.toLowerCase(),
            input.banned_by.toLowerCase(),
            expect.any(Number)
          ])
        })
      )
    })

    it('should handle duplicate ban gracefully', async () => {
      const input = {
        place_id: 'test-place-id',
        banned_address: '0x1234567890123456789012345678901234567890',
        banned_by: '0x0987654321098765432109876543210987654321'
      }

      const mockResult = {
        rowCount: 0,
        rows: []
      }

      mockedComponents.database.query.mockResolvedValue(mockResult)

      await sceneBanManager.addBan(input)

      expect(mockedComponents.database.query).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([
            expect.stringContaining('ON CONFLICT (place_id, banned_address) WHERE active = true')
          ])
        })
      )
    })

    it('should throw error for invalid input - missing place_id', async () => {
      const input = {
        banned_address: '0x1234567890123456789012345678901234567890',
        banned_by: '0x0987654321098765432109876543210987654321'
      }

      await expect(sceneBanManager.addBan(input)).rejects.toThrow('place_id is required and must be a string')
    })

    it('should throw error for invalid input - missing banned_address', async () => {
      const input = {
        place_id: 'test-place-id',
        banned_by: '0x0987654321098765432109876543210987654321'
      }

      await expect(sceneBanManager.addBan(input)).rejects.toThrow('banned_address is required and must be a string')
    })

    it('should throw error for invalid input - missing banned_by', async () => {
      const input = {
        place_id: 'test-place-id',
        banned_address: '0x1234567890123456789012345678901234567890'
      }

      await expect(sceneBanManager.addBan(input)).rejects.toThrow('banned_by is required and must be a string')
    })

    it('should throw error for invalid input - non-object', async () => {
      await expect(sceneBanManager.addBan('invalid')).rejects.toThrow('Input must be an object')
    })

    it('should throw error for invalid input - null', async () => {
      await expect(sceneBanManager.addBan(null)).rejects.toThrow('Input must be an object')
    })

    it('should throw error for invalid input - undefined', async () => {
      await expect(sceneBanManager.addBan(undefined)).rejects.toThrow('Input must be an object')
    })

    it('should convert addresses to lowercase', async () => {
      const input = {
        place_id: 'test-place-id',
        banned_address: '0x1234567890123456789012345678901234567890',
        banned_by: '0x0987654321098765432109876543210987654321'
      }

      const mockResult = {
        rowCount: 1,
        rows: []
      }

      mockedComponents.database.query.mockResolvedValue(mockResult)

      await sceneBanManager.addBan(input)

      expect(mockedComponents.database.query).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.arrayContaining([
            input.place_id,
            input.banned_address.toLowerCase(),
            input.banned_by.toLowerCase(),
            expect.any(Number)
          ])
        })
      )
    })

    it('should propagate database errors', async () => {
      const input = {
        place_id: 'test-place-id',
        banned_address: '0x1234567890123456789012345678901234567890',
        banned_by: '0x0987654321098765432109876543210987654321'
      }

      const dbError = new Error('Database connection failed')
      mockedComponents.database.query.mockRejectedValue(dbError)

      await expect(sceneBanManager.addBan(input)).rejects.toThrow('Database connection failed')
    })
  })
})
