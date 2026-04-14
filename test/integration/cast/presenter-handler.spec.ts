import { test } from '../../components'
import { makeRequest, owner } from '../../utils'
import { NotSceneAdminError } from '../../../src/logic/cast/errors'

test('Cast: Presenter Handlers', function ({ components, spyComponents }) {
  const validAddress = '0x1234567890abcdef1234567890abcdef12345678'

  const metadata = {
    sceneId: 'bafytest123',
    realm: {
      serverName: 'fenrir',
      hostname: 'https://peer.decentraland.zone',
      protocol: 'https'
    },
    parcel: '10,20'
  }

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when getting presenters', () => {
    describe('and the caller is a scene admin', () => {
      beforeEach(() => {
        spyComponents.cast.getPresenters.mockResolvedValueOnce({
          presenters: [validAddress]
        })
      })

      it('should respond with 200 and the presenters list', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenters',
          { method: 'GET', metadata },
          owner
        )

        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.presenters).toEqual([validAddress])
      })
    })

    describe('and the caller is not an admin', () => {
      beforeEach(() => {
        spyComponents.cast.getPresenters.mockRejectedValueOnce(new NotSceneAdminError())
      })

      it('should respond with 403', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenters',
          { method: 'GET', metadata },
          owner
        )

        expect(response.status).toBe(403)
      })
    })
  })

  describe('when promoting a presenter', () => {
    describe('and the caller is a scene admin', () => {
      beforeEach(() => {
        spyComponents.cast.promotePresenter.mockResolvedValueOnce(undefined)
      })

      it('should respond with 200 and a success message', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${validAddress}`,
          { method: 'PUT', metadata },
          owner
        )

        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.message).toBe('Participant promoted to presenter')
      })
    })

    describe('and the caller is not an admin', () => {
      beforeEach(() => {
        spyComponents.cast.promotePresenter.mockRejectedValueOnce(new NotSceneAdminError())
      })

      it('should respond with 403', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${validAddress}`,
          { method: 'PUT', metadata },
          owner
        )

        expect(response.status).toBe(403)
      })
    })

    describe('and the participantIdentity is a valid streamer identity', () => {
      beforeEach(() => {
        spyComponents.cast.promotePresenter.mockResolvedValueOnce(undefined)
      })

      it('should respond with 200', async () => {
        const streamerIdentity = 'stream:place-123:a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${encodeURIComponent(streamerIdentity)}`,
          { method: 'PUT', metadata },
          owner
        )

        expect(response.status).toBe(200)
      })
    })

    describe('and the participantIdentity is a watcher identity', () => {
      it('should respond with 400', async () => {
        const watcherIdentity = 'watch:room-123:a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${encodeURIComponent(watcherIdentity)}`,
          { method: 'PUT', metadata },
          owner
        )

        expect(response.status).toBe(400)
      })
    })

    describe('and the participantIdentity is a presentation bot identity', () => {
      it('should respond with 400', async () => {
        const botIdentity = 'presentation-bot:room-123:a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${encodeURIComponent(botIdentity)}`,
          { method: 'PUT', metadata },
          owner
        )

        expect(response.status).toBe(400)
      })
    })

    describe('and the participantIdentity is not a valid identity format', () => {
      it('should respond with 400', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenters/not-an-address',
          { method: 'PUT', metadata },
          owner
        )

        expect(response.status).toBe(400)
      })
    })
  })

  describe('when demoting a presenter', () => {
    describe('and the caller is a scene admin', () => {
      beforeEach(() => {
        spyComponents.cast.demotePresenter.mockResolvedValueOnce(undefined)
      })

      it('should respond with 200 and a success message', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${validAddress}`,
          { method: 'DELETE', metadata },
          owner
        )

        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.message).toBe('Participant demoted from presenter')
      })
    })

    describe('and the caller is not an admin', () => {
      beforeEach(() => {
        spyComponents.cast.demotePresenter.mockRejectedValueOnce(new NotSceneAdminError())
      })

      it('should respond with 403', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${validAddress}`,
          { method: 'DELETE', metadata },
          owner
        )

        expect(response.status).toBe(403)
      })
    })

    describe('and the participantIdentity is a valid streamer identity', () => {
      beforeEach(() => {
        spyComponents.cast.demotePresenter.mockResolvedValueOnce(undefined)
      })

      it('should respond with 200', async () => {
        const streamerIdentity = 'stream:place-123:a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${encodeURIComponent(streamerIdentity)}`,
          { method: 'DELETE', metadata },
          owner
        )

        expect(response.status).toBe(200)
      })
    })

    describe('and the participantIdentity is not a valid identity format', () => {
      it('should respond with 400', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenters/invalid-address',
          { method: 'DELETE', metadata },
          owner
        )

        expect(response.status).toBe(400)
      })
    })
  })
})
