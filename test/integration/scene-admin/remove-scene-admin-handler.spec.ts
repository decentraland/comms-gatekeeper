import { test } from '../../components'
import { getIdentity, makeRequest } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import SQL from 'sql-template-strings'
import { setupFetchMock } from '../fetch-mock'

test('DELETE /scene-admin/:entityId/:admin - removes administrator access for a scene', ({ components }) => {
  const resetFetchMock = setupFetchMock()

  let cleanup: TestCleanup
  const entityId = 'bafkreia4tksinqrkoqzrg32cnecleaotgnc32e6qhmstr42qfslc42rqta'
  const admin = '0x3333333333333333333333333333333333333333'
  const owner = '0x7949f9f239d1a0816ce5eb364a1f588ae9cc1bf5'

  beforeEach(async () => {
    cleanup = new TestCleanup(components.database)

    await components.database.query(SQL`DELETE FROM scene_admin`)

    await components.database.query(SQL`
      INSERT INTO scene_admin (
        id, 
        entity_id, 
        admin, 
        owner, 
        added_by,
        created_at,
        active
      ) VALUES (
        gen_random_uuid(),
        ${entityId},
        ${admin.toLowerCase()},
        ${owner.toLowerCase()},
        ${owner.toLowerCase()},
        ${Date.now()},
        true
      )
    `)
  })

  afterEach(async () => {
    await cleanup.cleanup()
  })

  afterAll(() => {
    resetFetchMock()
  })

  it('returns 204 when successfully deactivating a scene admin', async () => {
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
                payload: owner,
                signature: ''
              }
            ]
          })
      }) as Promise<Response>
    })

    const response = await makeRequest(localFetch, `/scene-admin/${entityId}/${admin}`, {
      method: 'DELETE'
    })

    expect(response.status).toBe(204)
  })

  it('returns 400 when no authentication is provided', async () => {
    const { localFetch } = components

    const response = await localFetch.fetch(`/scene-admin/${entityId}/${admin}`, {
      method: 'DELETE'
    })

    expect(response.status).toBe(400)
  })

  it('returns 400 when an invalid entity ID is provided', async () => {
    const { localFetch } = components

    const response = await makeRequest(localFetch, `/scene-admin/invalid-id/${admin}`, {
      method: 'DELETE'
    })

    expect(response.status).toBe(400)
  })

  it('returns 400 when an invalid admin address is provided', async () => {
    const { localFetch } = components

    const response = await makeRequest(localFetch, `/scene-admin/${entityId}/0xinvalid`, {
      method: 'DELETE'
    })

    expect(response.status).toBe(400)
  })
})
