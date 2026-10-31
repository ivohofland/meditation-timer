import { keepAwake } from './platform'

function fakeDoc(visibilityState: DocumentVisibilityState = 'visible') {
  const listeners = new Set<() => void>()
  const doc = {
    visibilityState,
    addEventListener: (type: string, fn: () => void) => { if (type === 'visibilitychange') listeners.add(fn) },
    removeEventListener: (type: string, fn: () => void) => { if (type === 'visibilitychange') listeners.delete(fn) },
  }
  const fire = (state: DocumentVisibilityState) => { doc.visibilityState = state; listeners.forEach(fn => fn()) }
  return { doc: doc as unknown as Document, fire }
}

function fakeNav(request = vi.fn(async () => ({ release: vi.fn(async () => {}) }))) {
  return { nav: { wakeLock: { request } } as unknown as Navigator, request }
}

const tick = () => new Promise(r => setTimeout(r, 0))

test('requests a screen lock', () => {
  const { nav, request } = fakeNav()
  keepAwake(nav, fakeDoc().doc)
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledWith('screen')
})

test('re-requests when the page becomes visible again', async () => {
  const { nav, request } = fakeNav()
  const { doc, fire } = fakeDoc()
  keepAwake(nav, doc)
  await tick()
  fire('hidden')
  expect(request).toHaveBeenCalledTimes(1)
  fire('visible')
  expect(request).toHaveBeenCalledTimes(2)
})

test('release stops re-requesting and releases the held lock', async () => {
  const sentinel = { release: vi.fn(async () => {}) }
  const { nav, request } = fakeNav(vi.fn(async () => sentinel))
  const { doc, fire } = fakeDoc()
  const lock = keepAwake(nav, doc)
  await tick()
  lock.release()
  fire('visible')
  expect(request).toHaveBeenCalledTimes(1)
  expect(sentinel.release).toHaveBeenCalled()
})

test('a lock granted after release is released at once', async () => {
  const sentinel = { release: vi.fn(async () => {}) }
  const { nav } = fakeNav(vi.fn(async () => sentinel))
  const lock = keepAwake(nav, fakeDoc().doc)
  lock.release()
  await tick()
  expect(sentinel.release).toHaveBeenCalled()
})

test('no wakeLock support is not an error', () => {
  const lock = keepAwake({} as Navigator, fakeDoc().doc)
  expect(() => lock.release()).not.toThrow()
})

test('a refused request is swallowed', async () => {
  const onUnhandled = vi.fn()
  process.on('unhandledRejection', onUnhandled)
  const { nav } = fakeNav(vi.fn(async () => { throw new Error('NotAllowedError') }))
  expect(() => keepAwake(nav, fakeDoc().doc)).not.toThrow()
  await tick(); await tick()
  process.off('unhandledRejection', onUnhandled)
  expect(onUnhandled).not.toHaveBeenCalled()
})

import { keepAudioRunning, unlockAudio } from './platform'

function fakeAudioDoc() {
  const el = { src: '', loop: false, playsInline: false, setAttribute: vi.fn(), play: vi.fn(async () => {}), pause: vi.fn() }
  const { doc, fire } = fakeDoc()
  ;(doc as unknown as { createElement: () => typeof el }).createElement = () => el
  return { el, doc, fire }
}

test('unlockAudio returns a handle that stops the silent loop', async () => {
  const { el, doc } = fakeAudioDoc()
  const ctx = { resume: vi.fn(async () => {}) } as unknown as AudioContext
  const silence = await unlockAudio(ctx, doc)
  expect(el.play).toHaveBeenCalled()
  silence.release()
  expect(el.pause).toHaveBeenCalled()
})

test('keepAudioRunning resumes a suspended context when the page is shown again', () => {
  const { doc, fire } = fakeDoc()
  const ctx = { state: 'running', resume: vi.fn(async () => {}) }
  const watch = keepAudioRunning(ctx as unknown as AudioContext, doc)
  fire('visible')
  expect(ctx.resume).not.toHaveBeenCalled()
  ctx.state = 'suspended'
  fire('hidden')
  expect(ctx.resume).not.toHaveBeenCalled()
  fire('visible')
  expect(ctx.resume).toHaveBeenCalledTimes(1)
  watch.release()
  fire('visible')
  expect(ctx.resume).toHaveBeenCalledTimes(1)
})
