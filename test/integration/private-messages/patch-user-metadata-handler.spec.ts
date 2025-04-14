import { PrivateMessagesPrivacy } from '../../../src/types/social.type'
import { test } from '../../components'
import { makeRequest } from '../../utils'

test('PATCH /users/:address/private-messages-privacy', ({ components, spyComponents }) => {
  const validAddress = '0x5babd1869989570988b79b5f5086e17a9e96a235'
  const validToken = 'valid-token'
  let validBody: {
    private_messages_privacy: string
  }

  beforeEach(() => {
    validBody = {
      private_messages_privacy: PrivateMessagesPrivacy.ALL
    }
    spyComponents.config.requireString.mockImplementation((key) => {
      if (key === 'COMMS_GATEKEEPER_AUTH_TOKEN') return Promise.resolve(validToken)
      if (key === 'PRIVATE_MESSAGES_ROOM_ID') return Promise.resolve('private-messages')
      return Promise.resolve('')
    })
  })

  describe('when the authorization token is invalid', () => {
    it('should respond with a 401 and a message saying that the token is invalid', async () => {
      const response = await makeRequest(components.localFetch, `/users/${validAddress}/private-messages-privacy`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer invalid-token`
        },
        body: JSON.stringify(validBody)
      })

      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({ error: 'Access denied, invalid token' })
    })
  })

  describe('and the address is invalid', () => {
    it('should respond with a 400 and a message saying that the address is invalid', async () => {
      const response = await makeRequest(components.localFetch, `/users/invalid-address/private-messages-privacy`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        body: JSON.stringify(validBody)
      })

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: 'Invalid address' })
    })
  })

  describe('when the request body is an invalid JSON', () => {
    it('should respond with a 400 and a message saying that the request body is invalid', async () => {
      const response = await makeRequest(components.localFetch, `/users/${validAddress}/private-messages-privacy`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: 'invalid-json'
      })

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: 'Invalid request body' })
    })
  })

  describe('and the content of the body is invalid', () => {
    it('should respond with a 400 and a message saying that the private_messages_privacy value is invalid', async () => {
      const response = await makeRequest(components.localFetch, `/users/${validAddress}/private-messages-privacy`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        body: JSON.stringify({
          private_messages_privacy: 'invalid-value'
        })
      })

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: 'Invalid private_messages_privacy' })
    })
  })

  describe('and the content of the body is a valid JSON without the private_messages_privacy field', () => {
    it('should respond with a 400 and a message saying that the private_messages_privacy field is required', async () => {
      const response = await makeRequest(components.localFetch, `/users/${validAddress}/private-messages-privacy`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: 'Invalid private_messages_privacy' })
    })
  })

  describe('when the request is valid', () => {
    describe('and the participant does not exist in the room', () => {
      beforeEach(() => {
        spyComponents.livekit.updateParticipantMetadata.mockRejectedValueOnce(new Error('participant does not exist'))
      })

      it('should respond with a 400 and a message saying that the participant is not connected to the room', async () => {
        const response = await makeRequest(components.localFetch, `/users/${validAddress}/private-messages-privacy`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${validToken}`
          },
          body: JSON.stringify(validBody)
        })

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({ error: 'Participant is not connected to the room' })
      })
    })

    describe('and updating the participant metadata fails for other reasons', () => {
      beforeEach(() => {
        spyComponents.livekit.updateParticipantMetadata.mockRejectedValueOnce(
          new Error('Failed to update participant metadata')
        )
      })

      it('should propagate the error', async () => {
        const response = await makeRequest(components.localFetch, `/users/${validAddress}/private-messages-privacy`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${validToken}`
          },
          body: JSON.stringify(validBody)
        })

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({ error: 'Internal Server Error' })
      })
    })

    describe('and updating the participant private messages privacy metadata succeeds', () => {
      beforeEach(() => {
        spyComponents.livekit.updateParticipantMetadata.mockResolvedValueOnce(undefined)
      })

      it('should respond with a 204 and update the participant metadata', async () => {
        const response = await makeRequest(components.localFetch, `/users/${validAddress}/private-messages-privacy`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${validToken}`
          },
          body: JSON.stringify(validBody)
        })

        expect(response.status).toBe(204)
        expect(spyComponents.livekit.updateParticipantMetadata).toHaveBeenCalledWith('private-messages', validAddress, {
          private_messages_privacy: PrivateMessagesPrivacy.ALL
        })
      })
    })
  })
})
