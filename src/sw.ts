/**
 * The service worker: keeps the whole timer (pages, scripts, icons and the
 * stream's pieces) in a cache, so it opens and plays without a network.
 *
 * Pages: the network first, so a deploy shows at once; the cache when there
 * is none. Everything else: the cache first. Each build gets its own cache,
 * named after a hash of every file's content, and the old one goes when the
 * new one is ready.
 *
 * The build (vite.config.ts) puts the file list and the version in front of
 * this file as self.__TIMER__.
 */
import { cacheKey, partial } from './sw-lib'

interface SwEvent extends Event { waitUntil(p: Promise<unknown>): void }
interface FetchEv extends SwEvent { request: Request; respondWith(r: Promise<Response>): void }
interface Worker {
  __TIMER__: { version: string; files: string[] }
  location: Location
  addEventListener(type: 'install' | 'activate', listener: (e: SwEvent) => void): void
  addEventListener(type: 'fetch', listener: (e: FetchEv) => void): void
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void> }
}

const sw = self as unknown as Worker
const { version, files } = sw.__TIMER__
const CACHE = `timer-${version}`
const PAGE_TIMEOUT_MS = 4000

sw.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(files)).then(() => sw.skipWaiting()))
})

sw.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('timer-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => sw.clients.claim()),
  )
})

async function fromCache(key: string, request: Request): Promise<Response | null> {
  const cached = await (await caches.open(CACHE)).match(key)
  if (!cached) return null
  const range = request.headers.get('Range')
  return range ? partial(cached, range) : cached
}

sw.addEventListener('fetch', e => {
  const request = e.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== sw.location.origin) return
  const key = cacheKey(url, files)
  if (key === null) return

  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) })
        .catch(async () => (await fromCache(key, request)) ?? Response.error()),
    )
    return
  }
  e.respondWith(fromCache(key, request).then(r => r ?? fetch(request)))
})
