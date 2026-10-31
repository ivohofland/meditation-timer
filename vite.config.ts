import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/** Vite would serve the stream's .ts pieces as JavaScript; HLS players want MPEG-TS, as Nginx's default types give. */
const mpegTs: Connect.NextHandleFunction = (req, res, next) => {
  const piece = /^\/stream\/([a-z0-9-]+\.ts)$/.exec(new URL(req.url ?? '', 'http://x').pathname)
  if (!piece) return next()
  readFile(resolve(import.meta.dirname, 'public/stream', piece[1]!)).then(
    data => { res.setHeader('Content-Type', 'video/mp2t'); res.end(data) },
    () => next(),
  )
}

const streamPieces = (): Plugin => ({
  name: 'stream-pieces',
  configureServer: server => { server.middlewares.use(mpegTs) },
  configurePreviewServer: server => { server.middlewares.use(mpegTs) },
})

export default defineConfig({
  plugins: [streamPieces()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        tune: resolve(import.meta.dirname, 'tune.html'),
      },
    },
  },
  test: { globals: true },
})
