import { test } from '../../components'
import { makeRequest, owner } from '../../utils'
import { NotSceneAdminError } from '../../../src/logic/cast/errors'

test('Cast: Presenter Handler', function ({ components, spyComponents }) {
  const participantIdentity = '0x1234567890abcdef1234567890abcdef12345678'

  const metadata = {
    sceneId: 'bafytest123',
    realm: {
      serverName: 'fenrir',
      hostname: 'https://peer.decentraland.zone',
      protocol: 'https'
    },
    parcel: '10,20'
  }

  describe('GET /cast/presenters', () => {
    describe('when the caller is a scene admin', () => {
      beforeEach(() => {
        spyComponents.cast.getPresenters.mockResolvedValue({
          presenters: [participantIdentity]
        })
      })

      it('should return the list of presenters', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenters',
          { method: 'GET', metadata },
          owner
        )

        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.presenters).toEqual([participantIdentity])
      })
    })

    describe('when the caller is not an admin', () => {
      beforeEach(() => {
        spyComponents.cast.getPresenters.mockRejectedValue(
          new NotSceneAdminError('Only scene administrators can manage presenters')
        )
      })

      it('should return 401', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenters',
          { method: 'GET', metadata },
          owner
        )

        expect(response.status).toBe(401)
      })
    })
  })

  describe('PUT /cast/presenters/:participantIdentity', () => {
    describe('when the caller is a scene admin', () => {
      beforeEach(() => {
        spyComponents.cast.promotePresenter.mockResolvedValue(undefined)
      })

      it('should promote the participant to presenter', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${participantIdentity}`,
          {
            method: 'PUT',
            metadata
          },
          owner
        )

        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.message).toBe('Participant promoted to presenter')
      })
    })

    describe('when the caller is not an admin', () => {
      beforeEach(() => {
        spyComponents.cast.promotePresenter.mockRejectedValue(
          new NotSceneAdminError('Only scene administrators can manage presenters')
        )
      })

      it('should return 401', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${participantIdentity}`,
          {
            method: 'PUT',
            metadata
          },
          owner
        )

        expect(response.status).toBe(401)
      })
    })

    describe('when the participantIdentity is not a valid Ethereum address', () => {
      it('should return 400', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenters/not-an-address',
          {
            method: 'PUT',
            metadata
          },
          owner
        )

        expect(response.status).toBe(400)
      })
    })
  })

  describe('DELETE /cast/presenters/:participantIdentity', () => {
    describe('when the caller is a scene admin', () => {
      beforeEach(() => {
        spyComponents.cast.demotePresenter.mockResolvedValue(undefined)
      })

      it('should demote the participant from presenter', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${participantIdentity}`,
          {
            method: 'DELETE',
            metadata
          },
          owner
        )

        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.message).toBe('Participant demoted from presenter')
      })
    })

    describe('when the caller is not an admin', () => {
      beforeEach(() => {
        spyComponents.cast.demotePresenter.mockRejectedValue(
          new NotSceneAdminError('Only scene administrators can manage presenters')
        )
      })

      it('should return 401', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${participantIdentity}`,
          {
            method: 'DELETE',
            metadata
          },
          owner
        )

        expect(response.status).toBe(401)
      })
    })
  })
})
