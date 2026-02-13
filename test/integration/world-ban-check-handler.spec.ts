import { test } from '../components'
import { makeRequest } from '../utils'
import { TestCleanup } from '../db-cleanup'
import { createMockedWorldPlace } from '../mocks/places-mock'
import { AddSceneBanInput } from '../../src/types'

test('GET /worlds/:worldName/users/:address/ban-status', ({ components, stubComponents }) => {
  const address = '0xd9b96b5dc720fc52bede1ec3b40a930e15f70ddd'
  const worldName = 'my-world.eth'
  const endpoint = `/worlds/${worldName}/users/${address}/ban-status`

  let cleanup: TestCleanup

  beforeAll(async () => {
    cleanup = new TestCleanup(components.database)
  })

  afterEach(async () => {
    await cleanup.cleanup()
  })

  describe('when the authorization token is invalid', () => {
    let token: string

    beforeEach(() => {
      token = 'an-invalid-token'
    })

    it('should respond with a 401 and a message saying that the token is invalid', async () => {
      const response = await makeRequest(
        components.localFetch,
        endpoint,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      expect(response.status).toBe(401)
      expect(response.json()).resolves.toEqual({ error: 'Invalid authorization header' })
    })
  })

  describe('when the authorization token is valid', () => {
    let token: string
    let worldPlaceId: string

    beforeEach(() => {
      token = 'aToken'
      worldPlaceId = worldName

      stubComponents.places.getWorldByName.resolves(
        createMockedWorldPlace({
          id: worldPlaceId,
          world_name: worldName,
          world: true
        })
      )
    })

    describe('and the user is banned from the world', () => {
      let ban: AddSceneBanInput

      beforeEach(async () => {
        ban = {
          placeId: worldPlaceId,
          bannedAddress: address.toLowerCase(),
          bannedBy: '0x0000000000000000000000000000000000000001'
        }

        await components.sceneBanManager.addBan(ban)
        cleanup.trackInsert('scene_bans', { place_id: ban.placeId, banned_address: ban.bannedAddress })
      })

      it('should respond with a 200 and isBanned as true', async () => {
        const response = await makeRequest(
          components.localFetch,
          endpoint,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({ isBanned: true })
      })
    })

    describe('and the user is not banned from the world', () => {
      it('should respond with a 200 and isBanned as false', async () => {
        const response = await makeRequest(
          components.localFetch,
          endpoint,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({ isBanned: false })
      })
    })

    describe('and the places component throws an error', () => {
      beforeEach(() => {
        stubComponents.places.getWorldByName.rejects(new Error('Database error'))
      })

      it('should respond with a 200 and isBanned as false (fail open)', async () => {
        const response = await makeRequest(
          components.localFetch,
          endpoint,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({ isBanned: false })
      })
    })
  })
})
