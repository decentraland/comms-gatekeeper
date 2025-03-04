import { test } from '../../components'
import { getIdentity, makeRequest } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import { expect } from '@jest/globals'
import SQL from 'sql-template-strings'
import { setupFetchMock } from '../fetch-mock'

test('Complete lifecycle of scene administrators', async ({ components }) => {
  const resetFetchMock = setupFetchMock()

  let cleanup: TestCleanup
  const entityId = 'bafkreif3fpa5bue6aj6j5yqzpjct4wgooal3ay46llwsshum3u2ie35zm4'
  const adminAddress = '0x2222222222222222222222222222222222222222'
  const ownerAddress = '0x7949f9f239d1a0816ce5eb364a1f588ae9cc1bf5'

  beforeEach(async () => {
    cleanup = new TestCleanup(components.database)
    await cleanup.cleanup()

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
        ${adminAddress.toLowerCase()},
        ${ownerAddress.toLowerCase()},
        ${ownerAddress.toLowerCase()},
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

  it('lists the created administrator', async () => {
    const { localFetch } = components

    const response = await makeRequest(localFetch, `/scene-admin?entity_id=${entityId}`, {
      method: 'GET'
    })

    expect(response.status).toBe(200)
    const admins = await response.json()

    expect(Array.isArray(admins)).toBe(true)
    expect(admins.length).toBeGreaterThan(0)

    const foundAdmin = admins.find(
      (admin: any) => admin.entity_id === entityId && admin.admin === adminAddress.toLowerCase()
    )
    expect(foundAdmin).toBeDefined()
    expect(foundAdmin.owner).toBe(ownerAddress.toLowerCase())
    expect(foundAdmin.active).toBe(true)
    expect(foundAdmin.added_by).toBe(ownerAddress.toLowerCase())
  })

  it('deactivates an administrator', async () => {
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
                payload: ownerAddress,
                signature: ''
              }
            ]
          })
      }) as Promise<Response>
    })

    const response = await makeRequest(localFetch, `/scene-admin/${entityId}/${adminAddress}`, {
      method: 'DELETE'
    })

    expect(response.status).toBe(204)
  })

  it('verifies an administrator is not in active listing after deactivation', async () => {
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
                payload: ownerAddress,
                signature: ''
              }
            ]
          })
      }) as Promise<Response>
    })

    const deleteResponse = await makeRequest(localFetch, `/scene-admin/${entityId}/${adminAddress}`, {
      method: 'DELETE'
    })
    expect(deleteResponse.status).toBe(204)

    const response = await makeRequest(localFetch, `/scene-admin?entity_id=${entityId}`, {
      method: 'GET'
    })

    expect(response.status).toBe(200)
    const admins = await response.json()

    const foundAdmin = admins.find(
      (admin: any) => admin.entity_id === entityId && admin.admin === adminAddress.toLowerCase()
    )
    expect(foundAdmin).toBeUndefined()
  })
})
