import { test } from '../../components'
import { generateRandomWalletAddresses } from '@dcl/http-commons'
import { TestCleanup } from '../../db-cleanup'

test('Disabled places bans removal job', ({ components, spyComponents }) => {
  let placeIds: string[] = []
  let adminAddresses: string[] = []
  let bannedAddresses: string[] = []
  let cleanup: TestCleanup

  beforeEach(async () => {
    // Initialize cleanup utility
    cleanup = new TestCleanup(components.database)

    // Generate test data
    placeIds = ['place1', 'place2', 'place3', 'place4']
    adminAddresses = generateRandomWalletAddresses(4)
    bannedAddresses = generateRandomWalletAddresses(6)

    // Mock only the places component to simulate disabled places
    spyComponents.places.getPlaceStatusByIds.mockResolvedValue([
      { id: 'place1', disabled: false, world: false, world_name: '', base_position: '0,0' },
      { id: 'place2', disabled: true, world: false, world_name: '', base_position: '0,0' },
      { id: 'place3', disabled: true, world: false, world_name: '', base_position: '0,0' },
      { id: 'place4', disabled: false, world: false, world_name: '', base_position: '0,0' }
    ])

    // Create some test bans in the database and track them for cleanup
    const banData = [
      // Place 1 (enabled) - should not be affected
      { placeId: 'place1', bannedAddress: bannedAddresses[0], bannedBy: adminAddresses[0] },
      // Place 2 (disabled) - should be removed
      { placeId: 'place2', bannedAddress: bannedAddresses[1], bannedBy: adminAddresses[1] },
      { placeId: 'place2', bannedAddress: bannedAddresses[2], bannedBy: adminAddresses[1] },
      // Place 3 (disabled) - should be removed
      { placeId: 'place3', bannedAddress: bannedAddresses[3], bannedBy: adminAddresses[2] },
      // Place 4 (enabled) - should not be affected
      { placeId: 'place4', bannedAddress: bannedAddresses[4], bannedBy: adminAddresses[3] }
    ]

    await Promise.all(
      banData.map(async (ban) => {
        await components.sceneBanManager.addBan(ban)
        cleanup.trackInsert('scene_bans', {
          place_id: ban.placeId,
          banned_address: ban.bannedAddress,
          banned_by: ban.bannedBy
        })
      })
    )
  })

  afterEach(async () => {
    // Clean up test data using the cleanup utility
    await cleanup.cleanup()
  })

  describe('when there are no places with bans', () => {
    beforeEach(async () => {
      // Ensure a clean state by cleaning up any existing data
      await cleanup.cleanup()
    })

    it('should not remove any bans', async () => {
      await components.sceneBans.removeBansFromDisabledPlaces()

      expect(spyComponents.places.getPlaceStatusByIds).not.toHaveBeenCalled()
    })
  })

  describe('when there are places with bans but none are disabled', () => {
    beforeEach(() => {
      spyComponents.places.getPlaceStatusByIds.mockResolvedValue([
        { id: 'place1', disabled: false, world: false, world_name: '', base_position: '0,0' },
        { id: 'place2', disabled: false, world: false, world_name: '', base_position: '0,0' },
        { id: 'place3', disabled: false, world: false, world_name: '', base_position: '0,0' },
        { id: 'place4', disabled: false, world: false, world_name: '', base_position: '0,0' }
      ])
    })

    it('should not remove any bans', async () => {
      // Verify initial state
      const place1BansBefore = await components.sceneBanManager.listBannedAddresses('place1')
      const place2BansBefore = await components.sceneBanManager.listBannedAddresses('place2')
      const place3BansBefore = await components.sceneBanManager.listBannedAddresses('place3')
      const place4BansBefore = await components.sceneBanManager.listBannedAddresses('place4')

      expect(place1BansBefore).toHaveLength(1)
      expect(place2BansBefore).toHaveLength(2)
      expect(place3BansBefore).toHaveLength(1)
      expect(place4BansBefore).toHaveLength(1)

      await components.sceneBans.removeBansFromDisabledPlaces()

      expect(spyComponents.places.getPlaceStatusByIds).toHaveBeenCalledWith(expect.arrayContaining(placeIds))

      // Verify no bans were removed
      const place1BansAfter = await components.sceneBanManager.listBannedAddresses('place1')
      const place2BansAfter = await components.sceneBanManager.listBannedAddresses('place2')
      const place3BansAfter = await components.sceneBanManager.listBannedAddresses('place3')
      const place4BansAfter = await components.sceneBanManager.listBannedAddresses('place4')

      expect(place1BansAfter).toHaveLength(1)
      expect(place2BansAfter).toHaveLength(2)
      expect(place3BansAfter).toHaveLength(1)
      expect(place4BansAfter).toHaveLength(1)
    })
  })

  describe('when there are disabled places', () => {
    it('should remove bans only for disabled places', async () => {
      // Verify initial state
      const place1BansBefore = await components.sceneBanManager.listBannedAddresses('place1')
      const place2BansBefore = await components.sceneBanManager.listBannedAddresses('place2')
      const place3BansBefore = await components.sceneBanManager.listBannedAddresses('place3')
      const place4BansBefore = await components.sceneBanManager.listBannedAddresses('place4')

      expect(place1BansBefore).toHaveLength(1)
      expect(place2BansBefore).toHaveLength(2)
      expect(place3BansBefore).toHaveLength(1)
      expect(place4BansBefore).toHaveLength(1)

      // Run the expiration job
      await components.sceneBans.removeBansFromDisabledPlaces()

      // Verify the places component was called correctly
      expect(spyComponents.places.getPlaceStatusByIds).toHaveBeenCalledWith(expect.arrayContaining(placeIds))

      // Verify the actual database state after the operation
      const place1BansAfter = await components.sceneBanManager.listBannedAddresses('place1')
      const place2BansAfter = await components.sceneBanManager.listBannedAddresses('place2')
      const place3BansAfter = await components.sceneBanManager.listBannedAddresses('place3')
      const place4BansAfter = await components.sceneBanManager.listBannedAddresses('place4')

      // Enabled places should still have their bans
      expect(place1BansAfter).toHaveLength(1)
      expect(place4BansAfter).toHaveLength(1)

      // Disabled places should have their bans removed
      expect(place2BansAfter).toHaveLength(0)
      expect(place3BansAfter).toHaveLength(0)
    })
  })

  describe('when there are many places requiring batching', () => {
    beforeEach(async () => {
      // Create 250 places with bans in the database
      const manyPlaceIds = Array.from({ length: 250 }, (_, i) => `place${i + 1}`)

      // Create bans for all places
      const banData = manyPlaceIds.map((placeId, index) => ({
        placeId: placeId,
        bannedAddress: generateRandomWalletAddresses(1)[0],
        bannedBy: generateRandomWalletAddresses(1)[0]
      }))

      await Promise.all(
        banData.map(async (ban) => {
          await components.sceneBanManager.addBan(ban)
          cleanup.trackInsert('scene_bans', {
            place_id: ban.placeId,
            banned_address: ban.bannedAddress,
            banned_by: ban.bannedBy
          })
        })
      )

      // Mock place statuses with some disabled
      const placeStatuses = manyPlaceIds.map((placeId, index) => ({
        id: placeId,
        disabled: index % 3 === 0, // Every third place is disabled
        world: false,
        world_name: '',
        base_position: '0,0'
      }))

      spyComponents.places.getPlaceStatusByIds
        .mockResolvedValueOnce(placeStatuses.slice(0, 100))
        .mockResolvedValueOnce(placeStatuses.slice(100, 200))
        .mockResolvedValueOnce(placeStatuses.slice(200, 250))
    })

    it('should process places in batches and remove bans for disabled places', async () => {
      // Count initial bans
      const initialBansCount = await components.database.query('SELECT COUNT(*) FROM scene_bans')
      const initialCount = parseInt(initialBansCount.rows[0].count)

      await components.sceneBans.removeBansFromDisabledPlaces()

      expect(spyComponents.places.getPlaceStatusByIds).toHaveBeenCalledTimes(3)

      // Verify that bans were actually removed from the database
      const finalBansCount = await components.database.query('SELECT COUNT(*) FROM scene_bans')
      const finalCount = parseInt(finalBansCount.rows[0].count)

      // Should have removed some bans (approximately 1/3 of the 250 we created)
      expect(finalCount).toBeLessThan(initialCount)

      // Calculate how many bans were actually removed
      const removedCount = initialCount - finalCount
      expect(removedCount).toBeGreaterThan(0)

      // Verify that the places component was called with the correct batches
      expect(spyComponents.places.getPlaceStatusByIds).toHaveBeenNthCalledWith(1, expect.any(Array))
      expect(spyComponents.places.getPlaceStatusByIds).toHaveBeenNthCalledWith(2, expect.any(Array))
      expect(spyComponents.places.getPlaceStatusByIds).toHaveBeenNthCalledWith(3, expect.any(Array))
    })
  })

  describe('when an error occurs during processing', () => {
    it('should propagate the error', async () => {
      // Mock the places component to throw an error
      spyComponents.places.getPlaceStatusByIds.mockRejectedValue(new Error('Places service error'))

      await expect(components.sceneBans.removeBansFromDisabledPlaces()).rejects.toThrow('Places service error')
    })
  })
})
