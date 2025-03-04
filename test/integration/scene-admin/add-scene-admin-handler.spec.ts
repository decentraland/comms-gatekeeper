import { test } from '../../components'
import { getIdentity, makeRequest } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import { setupFetchMock } from '../fetch-mock'

test('POST /scene-admin - adds a new administrator to a scene', ({ components }) => {
  let cleanup: TestCleanup

  const resetFetchMock = setupFetchMock()

  beforeEach(async () => {
    cleanup = new TestCleanup(components.database)
  })

  afterEach(async () => {
    await cleanup.cleanup()
    resetFetchMock()
  })

  const payload = {
    entity_id: 'bafkreihanfox3up5qaax5mffvkgca6cqyx6qbuiuxcirbwqt2bqlmxg65e',
    admin: '0x1111111111111111111111111111111111111111'
  }

  it('returns 204 when successfully creating a scene admin', async () => {
    const { localFetch } = components

    jest.spyOn(global, 'fetch').mockImplementationOnce(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            authChain: [
              {
                type: 'SIGNER',
                payload: '0x7949f9f239d1a0816ce5eb364a1f588ae9cc1bf5',
                signature: ''
              }
            ]
          })
      }) as Promise<Response>
    })

    const response = await makeRequest(localFetch, '/scene-admin', {
      method: 'POST',
      body: JSON.stringify(payload)
    })

    expect(response.status).toBe(204)
  })

  it('returns 400 when no authentication is provided', async () => {
    const { localFetch } = components

    const response = await localFetch.fetch('/scene-admin', {
      method: 'POST',
      body: JSON.stringify(payload)
    })

    expect(response.status).toBe(400)
  })

  it('returns 400 when payload is missing required fields', async () => {
    const { localFetch } = components

    const response = await makeRequest(localFetch, '/scene-admin', {
      method: 'POST',
      body: JSON.stringify({ ...payload, entity_id: undefined })
    })

    expect(response.status).toBe(400)
  })

  it('returns 400 when entity_id has an invalid format', async () => {
    const { localFetch } = components

    const response = await makeRequest(localFetch, '/scene-admin', {
      method: 'POST',
      body: JSON.stringify({ ...payload, entity_id: 'invalid-id' })
    })

    expect(response.status).toBe(400)
  })

  it('returns 400 when admin address has an invalid format', async () => {
    const { localFetch } = components

    const response = await makeRequest(localFetch, '/scene-admin', {
      method: 'POST',
      body: JSON.stringify({ ...payload, admin: '0xinvalid' })
    })

    expect(response.status).toBe(400)
  })
})
