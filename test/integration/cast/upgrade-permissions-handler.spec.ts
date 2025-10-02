import { test } from '../../components'
import { makeRequest } from '../../utils'

test('Cast: Upgrade Permissions Handler', function ({ components, spyComponents }) {
  let validRoomId: string
  let validParticipantId: string
  let validWalletAddress: string
  let validSignature: string

  beforeEach(() => {
    validRoomId = 'test-room-123'
    validParticipantId = 'participant-456'
    validWalletAddress = '0x1234567890abcdef'
    validSignature = 'valid-signature-string-longer-than-ten-chars'

    // Mock cast component
    spyComponents.cast.upgradeParticipantPermissions.mockResolvedValue(undefined)
  })

  it('should upgrade participant permissions with valid data', async () => {
    const requestBody = {
      roomId: validRoomId,
      participantId: validParticipantId,
      walletAddress: validWalletAddress,
      signature: validSignature
    }

    const response = await makeRequest(components.localFetch, '/cast/upgrade-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.permissions.canPublishData).toBe(true)
    expect(spyComponents.cast.upgradeParticipantPermissions).toHaveBeenCalledWith({
      roomId: validRoomId,
      participantId: validParticipantId,
      walletAddress: validWalletAddress,
      signature: validSignature
    })
  })

  it('should reject requests with missing roomId', async () => {
    const requestBody = {
      participantId: validParticipantId,
      walletAddress: validWalletAddress,
      signature: validSignature
    }

    const response = await makeRequest(components.localFetch, '/cast/upgrade-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    expect(response.status).toBe(400)
  })

  it('should reject requests with missing participantId', async () => {
    const requestBody = {
      roomId: validRoomId,
      walletAddress: validWalletAddress,
      signature: validSignature
    }

    const response = await makeRequest(components.localFetch, '/cast/upgrade-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    expect(response.status).toBe(400)
  })

  it('should reject requests with missing walletAddress', async () => {
    const requestBody = {
      roomId: validRoomId,
      participantId: validParticipantId,
      signature: validSignature
    }

    const response = await makeRequest(components.localFetch, '/cast/upgrade-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    expect(response.status).toBe(400)
  })

  it('should reject requests with missing signature', async () => {
    const requestBody = {
      roomId: validRoomId,
      participantId: validParticipantId,
      walletAddress: validWalletAddress
    }

    const response = await makeRequest(components.localFetch, '/cast/upgrade-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    expect(response.status).toBe(400)
  })

  it('should reject blacklisted wallet', async () => {
    spyComponents.cast.upgradeParticipantPermissions.mockRejectedValue(new Error('Access denied, deny-listed wallet'))

    const requestBody = {
      roomId: validRoomId,
      participantId: validParticipantId,
      walletAddress: validWalletAddress,
      signature: validSignature
    }

    const response = await makeRequest(components.localFetch, '/cast/upgrade-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    expect(response.status).toBe(400)
  })

  it('should handle errors gracefully', async () => {
    spyComponents.cast.upgradeParticipantPermissions.mockRejectedValue(new Error('Internal error'))

    const requestBody = {
      roomId: validRoomId,
      participantId: validParticipantId,
      walletAddress: validWalletAddress,
      signature: validSignature
    }

    const response = await makeRequest(components.localFetch, '/cast/upgrade-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    expect(response.status).toBe(400)
  })
})
