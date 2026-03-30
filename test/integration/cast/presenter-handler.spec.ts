import { test } from '../../components'
import { makeRequest, owner } from '../../utils'
import { UnauthorizedError } from '../../../src/types/errors'

test('Cast: Presenter Handler', function ({ components, spyComponents }) {
  const roomId = 'scene:fenrir:bafytest123'
  const participantIdentity = 'stream:place-123:1234567890'

  const metadata = {
    sceneId: 'bafytest123',
    realm: {
      serverName: 'fenrir',
      hostname: 'https://peer.decentraland.zone',
      protocol: 'https'
    },
    parcel: '10,20'
  }

  describe('GET /cast/presenter', () => {
    describe('when the caller is a scene admin', () => {
      beforeEach(() => {
        spyComponents.cast.getPresenters.mockResolvedValue({
          presenters: [participantIdentity]
        })
      })

      it('should return the list of presenters', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenter?roomId=${roomId}`,
          { method: 'GET', metadata },
          owner
        )

        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.presenters).toEqual([participantIdentity])
        expect(spyComponents.cast.getPresenters).toHaveBeenCalledWith(
          roomId,
          owner.authChain[0].payload
        )
      })
    })

    describe('when roomId query parameter is missing', () => {
      it('should return 400', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenter',
          { method: 'GET', metadata },
          owner
        )

        expect(response.status).toBe(400)
      })
    })

    describe('when the caller is not an admin', () => {
      beforeEach(() => {
        spyComponents.cast.getPresenters.mockRejectedValue(
          new UnauthorizedError('Only scene administrators can manage presenters')
        )
      })

      it('should return 401', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenter?roomId=${roomId}`,
          { method: 'GET', metadata },
          owner
        )

        expect(response.status).toBe(401)
      })
    })
  })

  describe('POST /cast/presenter', () => {
    describe('when the caller is a scene admin', () => {
      beforeEach(() => {
        spyComponents.cast.promotePresenter.mockResolvedValue(undefined)
      })

      it('should promote the participant to presenter', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenter',
          {
            method: 'POST',
            metadata,
            body: JSON.stringify({ roomId, participantIdentity })
          },
          owner
        )

        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.message).toBe('Participant promoted to presenter')
        expect(spyComponents.cast.promotePresenter).toHaveBeenCalledWith(
          roomId,
          participantIdentity,
          owner.authChain[0].payload
        )
      })
    })

    describe('when the caller is not an admin', () => {
      beforeEach(() => {
        spyComponents.cast.promotePresenter.mockRejectedValue(
          new UnauthorizedError('Only scene administrators can manage presenters')
        )
      })

      it('should return 401', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenter',
          {
            method: 'POST',
            metadata,
            body: JSON.stringify({ roomId, participantIdentity })
          },
          owner
        )

        expect(response.status).toBe(401)
      })
    })
  })

  describe('DELETE /cast/presenter', () => {
    describe('when the caller is a scene admin', () => {
      beforeEach(() => {
        spyComponents.cast.demotePresenter.mockResolvedValue(undefined)
      })

      it('should demote the participant from presenter', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenter',
          {
            method: 'DELETE',
            metadata,
            body: JSON.stringify({ roomId, participantIdentity })
          },
          owner
        )

        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.message).toBe('Participant demoted from presenter')
        expect(spyComponents.cast.demotePresenter).toHaveBeenCalledWith(
          roomId,
          participantIdentity,
          owner.authChain[0].payload
        )
      })
    })

    describe('when the caller is not an admin', () => {
      beforeEach(() => {
        spyComponents.cast.demotePresenter.mockRejectedValue(
          new UnauthorizedError('Only scene administrators can manage presenters')
        )
      })

      it('should return 401', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenter',
          {
            method: 'DELETE',
            metadata,
            body: JSON.stringify({ roomId, participantIdentity })
          },
          owner
        )

        expect(response.status).toBe(401)
      })
    })
  })
})
