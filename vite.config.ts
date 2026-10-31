import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { buildPlaylist, type Pieces, timeline } from './src/playlist'
import { parseSettings } from './src/settings'
import pieces from './src/stream-pieces.json'

/**
 * Serves /stream/session.m3u8?total=&interval=&start= for the stream comparison
 * page, in dev and preview. Static hosting has no equivalent yet.
 */
const sessionPlaylist: Connect.NextHandleFunction = (req, res, next) => {
  const url = new URL(req.url ?? '', 'http://x')
  const piece = /^\/stream\/([a-z0-9-]+\.ts)$/.exec(url.pathname)
  if (piece) {
    // Vite would serve .ts as JavaScript; HLS players want MPEG-TS (as Nginx's default types give).
    readFile(resolve(import.meta.dirname, 'public/stream', piece[1]!)).then(
      data => { res.setHeader('Content-Type', 'video/mp2t'); res.end(data) },
      () => next(),
    )
    return
  }
  if (url.pathname !== '/stream/session.m3u8') return next()
  const q = url.searchParams
  const settings = parseSettings({
    totalMinutes: Number(q.get('total')),
    intervalMinutes: q.get('interval') ? Number(q.get('interval')) : null,
    startBell: q.get('start') === '1',
  })
  if (!settings) {
    res.statusCode = 400
    res.end('bad settings')
    return
  }
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
  res.setHeader('Cache-Control', 'no-store')
  res.end(buildPlaylist(timeline(settings, pieces as Pieces), '/stream/'))
}

const streamPlaylist = (): Plugin => ({
  name: 'stream-playlist',
  configureServer: server => { server.middlewares.use(sessionPlaylist) },
  configurePreviewServer: server => { server.middlewares.use(sessionPlaylist) },
})

export default defineConfig({
  plugins: [streamPlaylist()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        stream: resolve(import.meta.dirname, 'stream.html'),
        tune: resolve(import.meta.dirname, 'tune.html'),
      },
    },
  },
  test: { globals: true },
})
