export function setupFetchMock() {
  const originalFetch = global.fetch

  const mockFetch = jest.fn().mockImplementation((url) => {
    if (!url) {
      return Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'No URL provided' })
      })
    }

    const urlString = typeof url === 'object' ? url.toString() : String(url)

    if (urlString.includes('/audit/scene/')) {
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
      })
    }

    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Not found' })
    })
  })

  global.fetch = mockFetch

  return () => {
    global.fetch = originalFetch
  }
}
