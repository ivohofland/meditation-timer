import type { Timeline } from './playlist'
import { StreamSession, type MediaLike } from './stream-session'
import { RELEASE_S } from './synth-bell'

const tl: Timeline = { pieces: [], sittingStartS: 19.5, sittingEndS: 79.4, totalS: 136.5 }

function fakes() {
  const audio = {
    src: '', currentTime: 0, volume: 1, ended: false, error: null as MediaError | null,
    play: vi.fn(async () => {}), pause: vi.fn(),
  }
  const clock = { ms: 0 }
  const s = new StreamSession(audio as MediaLike, tl, 60, 'blob:session', () => clock.ms)
  return { audio, clock, s }
}

test('start sets the source and plays, once', () => {
  const { audio, s } = fakes()
  expect(s.state()).toBe('idle')
  s.start(); s.start()
  expect(audio.src).toBe('blob:session')
  expect(audio.play).toHaveBeenCalledTimes(1)
})

test('state, lead-in and remaining follow the stream position', () => {
  const { audio, s } = fakes()
  expect(s.remainingS()).toBe(60); expect(s.leadInS()).toBe(19.5)
  s.start()
  audio.currentTime = 10; expect(s.state()).toBe('settling'); expect(s.leadInS()).toBeCloseTo(9.5); expect(s.remainingS()).toBe(60)
  audio.currentTime = 49.4; expect(s.state()).toBe('running'); expect(s.remainingS()).toBeCloseTo(30); expect(s.leadInS()).toBe(0)
  audio.currentTime = 100; expect(s.state()).toBe('ringing-out'); expect(s.remainingS()).toBe(0)
  audio.ended = true; expect(s.state()).toBe('done')
})

test('stop fades the volume over RELEASE_S on each tick, then pauses', () => {
  const { audio, clock, s } = fakes()
  s.start()
  clock.ms = 1000
  s.stop()
  expect(s.state()).toBe('stopped')
  expect(s.released()).toBe(false)
  clock.ms = 1000 + (RELEASE_S * 1000) / 2; s.tick()
  expect(audio.volume).toBeCloseTo(0.5)
  expect(audio.pause).not.toHaveBeenCalled()
  clock.ms = 1000 + RELEASE_S * 1000; s.tick()
  expect(audio.pause).toHaveBeenCalledTimes(1)
  expect(s.released()).toBe(true)
})

test('a playback error ends the session and is reported', () => {
  const { audio, s } = fakes()
  s.start()
  audio.error = { code: 4, message: 'unsupported' } as MediaError
  expect(s.state()).toBe('done')
  expect(s.error()).toContain('unsupported')
})

test('a refused play() is reported', async () => {
  const { audio, s } = fakes()
  audio.play.mockRejectedValueOnce(new Error('NotAllowedError'))
  s.start()
  await new Promise(r => setTimeout(r, 0))
  expect(s.state()).toBe('done')
  expect(s.error()).toContain('NotAllowedError')
})
