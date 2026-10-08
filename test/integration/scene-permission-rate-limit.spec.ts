import { test } from '../components'
import { makeRequest, owner } from '../utils'

test('Scene permission request quotas', ({ components, spyComponents }) => {
  let metadata: { sceneId: string; realm: { serverName: string; hostname: string } }
  let limit: number

  beforeEach(async () => {
    metadata = {
      sceneId: 'scene',
      realm: { serverName: 'realm', hostname: 'https://peer.decentraland.org' }
    }
    limit = (await components.config.getNumber('SCENE_PERMISSION_REQUEST_LIMIT')) ?? 60
  })

  it('should share the quota across signed routes and stop before upstream permission checks', async () => {
    // Missing parcel requests reach the handler and return 400; even denied work consumes the shared quota.
    for (let index = 0; index < limit; index++) {
      expect((await makeRequest(components.localFetch, '/scene-bans', { metadata }, owner)).status).toBe(400)
    }
    const response = await makeRequest(components.localFetch, '/cast/generate-stream-link', { metadata }, owner)
    expect(response.status).toBe(429)
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(spyComponents.sceneManager.isSceneOwnerOrAdmin).not.toHaveBeenCalled()
    expect(spyComponents.cast.generateStreamLink).not.toHaveBeenCalled()
  })
})
