import { test } from '../../components'
import { makeRequest, admin } from '../../utils'

test('Cast: Generate Stream Link Handler', function ({ components, spyComponents }) {
  let worldName: string
  let placeId: string
  let mockPlace: any
  let mockStreamLink: any

  beforeEach(() => {
    worldName = 'my-test-world'
    placeId = 'test-place-123'

    mockPlace = {
      id: placeId,
      title: 'Test Place',
      world_name: worldName,
      base_position: '0,0',
      positions: ['0,0'],
      owner: admin.ephemeralIdentity.address,
      deployed_at: Date.now()
    }

    mockStreamLink = {
      streamLink: 'https://decentraland.org/cast/s/cast2-link-12345678-1234-1234-1234-1234567890ab',
      streamingKey: 'cast2-link-12345678-1234-1234-1234-1234567890ab',
      placeId: placeId,
      placeName: 'Test Place',
      expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      expiresInDays: 4
    }

    // Mock cast component
    spyComponents.cast.generateStreamLink.mockResolvedValue(mockStreamLink)
  })

  it('should generate stream link for world name', async () => {
    const response = await makeRequest(
      components.localFetch,
      '/cast/generate-stream-link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldName })
      },
      admin
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.streamLink).toBe(mockStreamLink.streamLink)
    expect(body.streamingKey).toBe(mockStreamLink.streamingKey)
    expect(body.placeId).toBe(placeId)
    expect(body.placeName).toBe('Test Place')
    expect(body.expiresInDays).toBe(4)
    expect(body.expiresAt).toBeDefined()

    expect(spyComponents.cast.generateStreamLink).toHaveBeenCalledWith(
      expect.objectContaining({
        worldName,
        parcel: undefined
      })
    )
  })

  it('should generate stream link for parcel', async () => {
    const parcel = '0,0'

    const response = await makeRequest(
      components.localFetch,
      '/cast/generate-stream-link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parcel })
      },
      admin
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.streamLink).toBeDefined()
    expect(spyComponents.cast.generateStreamLink).toHaveBeenCalledWith(
      expect.objectContaining({
        worldName: undefined,
        parcel
      })
    )
  })

  it('should reject unauthorized users', async () => {
    spyComponents.cast.generateStreamLink.mockRejectedValue(
      new Error('Only scene administrators can generate stream links')
    )

    const response = await makeRequest(
      components.localFetch,
      '/cast/generate-stream-link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldName })
      },
      admin
    )

    expect(response.status).toBe(400)
  })

  it('should reject requests without authentication', async () => {
    const response = await components.localFetch.fetch('/cast/generate-stream-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldName })
    })

    expect(response.status).toBe(400)
  })

  it('should reject requests without worldName or parcel', async () => {
    spyComponents.cast.generateStreamLink.mockRejectedValue(new Error('Either worldName or parcel must be provided'))

    const response = await makeRequest(
      components.localFetch,
      '/cast/generate-stream-link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      },
      admin
    )

    expect(response.status).toBe(400)
  })

  it('should reject requests with invalid JSON', async () => {
    const response = await makeRequest(
      components.localFetch,
      '/cast/generate-stream-link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      },
      admin
    )

    expect(response.status).toBe(400)
  })

  it('should handle errors gracefully', async () => {
    spyComponents.cast.generateStreamLink.mockRejectedValue(new Error('Database error'))

    const response = await makeRequest(
      components.localFetch,
      '/cast/generate-stream-link',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldName })
      },
      admin
    )

    expect(response.status).toBe(400)
  })
})
