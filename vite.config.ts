import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
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

async function filesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries.filter(e => e.isFile()).map(e => join(e.parentPath, e.name))
}

/**
 * Puts the list of every built file, and a version hashed from all their
 * contents, in front of sw.js. A sound re-rendered under the same name
 * changes the version too, so the new service worker replaces the old cache.
 */
const precache = (): Plugin => ({
  name: 'precache',
  apply: 'build',
  async writeBundle(options) {
    const dir = options.dir ?? resolve(import.meta.dirname, 'dist')
    const sw = join(dir, 'sw.js')
    const paths = (await filesIn(dir)).filter(f => f !== sw).sort()
    const hash = createHash('sha256')
    for (const path of paths) hash.update(relative(dir, path)).update(await readFile(path))
    const files = ['/', ...paths.map(p => `/${relative(dir, p).split('\\').join('/')}`)]
    const head = `self.__TIMER__ = ${JSON.stringify({ version: hash.digest('hex').slice(0, 12), files })};\n`
    await writeFile(sw, head + (await readFile(sw, 'utf8')))
  },
})

export default defineConfig({
  plugins: [streamPieces(), precache()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        tune: resolve(import.meta.dirname, 'tune.html'),
        sw: resolve(import.meta.dirname, 'src/sw.ts'),
      },
      // The service worker's scope is the folder it is served from: the root.
      output: { entryFileNames: chunk => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
    },
  },
  test: { globals: true },
})
