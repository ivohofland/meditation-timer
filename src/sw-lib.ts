/**
 * The precached file that answers a request, or null. The query belongs to
 * the page (?engine=…), not to another file; /tune is tune.html, as nginx's
 * try_files serves it.
 */
export function cacheKey(url: URL, files: readonly string[]): string | null {
  for (const candidate of [url.pathname, `${url.pathname}.html`]) {
    if (files.includes(candidate)) return candidate
  }
  return null
}

/**
 * A cached file answering a Range request. Safari asks media in ranges and
 * refuses a 200 where it wanted a 206. One range only; anything else gets the
 * whole file, which a client must accept.
 */
export async function partial(full: Response, range: string): Promise<Response> {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  const data = await full.arrayBuffer()
  const size = data.byteLength
  const whole = () => new Response(data, { status: 200, headers: full.headers })
  if (!m || (m[1] === '' && m[2] === '')) return whole()

  let start: number
  let end: number
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]))
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }
  if (end < start) return whole()

  const headers = new Headers(full.headers)
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
  headers.set('Content-Length', String(end - start + 1))
  return new Response(data.slice(start, end + 1), { status: 206, headers })
}
