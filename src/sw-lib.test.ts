import { cacheKey, partial } from './sw-lib'

describe('cacheKey: which precached file answers a request', () => {
  const files = ['/', '/index.html', '/tune.html', '/stream/end.ts']
  it.each([
    ['/', '/'],
    ['/?engine=stream', '/'], // the query is the page's, not another file
    ['/tune', '/tune.html'], // nginx's try_files $uri.html
    ['/stream/end.ts', '/stream/end.ts'],
    ['/nope', null],
  ])('%s → %s', (path, expected) => {
    expect(cacheKey(new URL(path, 'https://timer.fair.yoga'), files)).toBe(expected)
  })
})

describe('partial: a Range request from the cache', () => {
  const body = () => new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), { headers: { 'Content-Type': 'video/mp2t' } })
  const bytes = async (r: Response) => [...new Uint8Array(await r.arrayBuffer())]

  it('answers 206 with the asked bytes, as Safari needs for media', async () => {
    const r = await partial(body(), 'bytes=2-5')
    expect(r.status).toBe(206)
    expect(r.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(r.headers.get('Content-Length')).toBe('4')
    expect(r.headers.get('Content-Type')).toBe('video/mp2t')
    expect(await bytes(r)).toEqual([2, 3, 4, 5])
  })

  it('reads an open end as up to the last byte, and clamps an end past it', async () => {
    expect(await bytes(await partial(body(), 'bytes=7-'))).toEqual([7, 8, 9])
    expect((await partial(body(), 'bytes=8-99')).headers.get('Content-Range')).toBe('bytes 8-9/10')
  })

  it('reads a suffix as the last n bytes', async () => {
    expect(await bytes(await partial(body(), 'bytes=-3'))).toEqual([7, 8, 9])
  })

  it('answers 416 for a range past the end', async () => {
    const r = await partial(body(), 'bytes=10-')
    expect(r.status).toBe(416)
    expect(r.headers.get('Content-Range')).toBe('bytes */10')
  })

  it('answers the whole file for a range it cannot read', async () => {
    for (const range of ['items=0-1', 'bytes=1-2,4-5', 'bytes=5-2']) {
      const r = await partial(body(), range)
      expect(r.status, range).toBe(200)
      expect(await bytes(r)).toHaveLength(10)
    }
  })
})
